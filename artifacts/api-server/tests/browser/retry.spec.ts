import { test, expect, type Page } from "@playwright/test";
import retryRunner from "./retry-runner-helper.cjs";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const exec = promisify(execFile);
const ids: string[] = [];
let guard: ChildProcess;
const fixture = async (command: string, value: string) => {
  const { stdout } = await exec(process.execPath, ["--import", "tsx", "tests/retry-browser-fixtures.ts", command, value]);
  return stdout.trim() ? JSON.parse(stdout) : undefined;
};
const roomPath = (id: string) => `/classrooms/${id}`;
const retryPath = (id: string) => `/api/classrooms/${id}/retry-failed-pages`;

async function seed(page: Page, owner?: string) {
  const profile = await page.request.get("/api/profile");
  expect(profile.status(), "Programmatic Clerk login must authenticate real API requests").toBe(200);
  const p = await profile.json();
  expect(p.completed, "Use a completed isolated test profile").toBe(true);
  const { id } = await fixture("seed", owner ?? p.id);
  ids.push(id);
  return id as string;
}
async function seedMultiDocument(page: Page) {
  const profile = await page.request.get("/api/profile");
  expect(profile.status(), "Programmatic Clerk login must authenticate real API requests").toBe(200);
  const p = await profile.json();
  expect(p.completed, "Use a completed isolated test profile").toBe(true);
  const { id } = await fixture("seed-multi", p.id);
  ids.push(id);
  return id as string;
}
async function locked(page: Page, id: string) {
  await retryRunner.assertLocked(page, id, expect);
}

test.beforeAll(async () => {
  guard = spawn(process.execPath, ["--import", "tsx", "tests/retry-browser-fixtures.ts", "guard"], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Fixture worker guard timed out")), 15000);
    guard.stdout!.on("data", (chunk) => {
      output += chunk;
      if (output.includes("Fixture worker guard ready")) { clearTimeout(timer); resolve(); }
    });
    guard.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Fixture worker guard exited: ${code}`)); });
  });
});
test.afterAll(async () => {
  const results = await Promise.allSettled(ids.map(async (id) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fixture("cleanup", id);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    throw lastError;
  }));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    guard?.stdout?.destroy();
    guard?.stderr?.destroy();
    guard?.unref();
    throw new Error(`Could not clean up ${failures.length} isolated fixture(s); advisory worker guard remains held.`);
  }
  if (guard && guard.exitCode === null) {
    await new Promise<void>((resolve) => { guard.once("exit", () => resolve()); guard.kill("SIGTERM"); });
  }
});

test("real retry button, processing reload, polling to ready, ready reload", async ({ page }) => {
  const id = await seed(page);
  const before = await fixture("read", id);
  await page.goto(roomPath(id));
  await expect(page.getByRole("heading", { name: before.data.name })).toBeVisible();
  await expect(page.getByRole("main").getByText("Needs attention", { exact: true })).toBeVisible();
  await expect(page.getByText("1 of 2 pages verified.")).toBeVisible();
  await locked(page, id);

  // Delay before forwarding; route.continue preserves the real browser's Clerk auth.
  await retryRunner.submitRetry(page, id, before.sourceMap, expect);
  await locked(page, id);
  const queued = await fixture("read", id);
  expect(queued.jobs.find((j: { page: number }) => j.page === 2)).toMatchObject({ status: "pending", attempts: 0, failure: null });
  expect(queued.sourceMap).toEqual(before.sourceMap);
  const list = await page.request.get("/api/classrooms");
  expect((await list.json()).find((r: { id: string }) => r.id === id).status).toBe("processing");
  await page.reload();
  await retryRunner.assertProcessing(page, id, expect);

  const polled = retryRunner.waitForStatusPoll(page, id, "ready");
  await fixture("ready", id);
  await polled;
  await retryRunner.assertReady(page, id, expect);
  const after = await fixture("read", id);
  expect(after.sourceMap[0]).toEqual(before.sourceMap[0]);
  expect(after.data.concepts[0]).toEqual(before.data.concepts[0]);
  await page.reload();
  await retryRunner.assertReady(page, id, expect);
});

test("retry preserves global/local page and citation alignment across several PDFs", async ({ page }) => {
  const id = await seedMultiDocument(page);
  const before = await fixture("read", id);
  const documents = before.data.documents;

  expect(documents).toHaveLength(3);
  expect(documents.map((document: { pageCount: number }) => document.pageCount)).toEqual([1, 2, 1]);
  expect(before.data.coverage).toMatchObject({ pages: 4, mappedPages: 3, flaggedPages: [3] });
  await retryRunner.assertMultiDocumentEvidence(before, expect);
  const failed = before.jobs.find((job: { status: string }) => job.status === "failed");
  expect(failed).toMatchObject({ page: 3, documentId: documents[1].id, localPage: 2, attempts: 3 });

  const retainedPages = [1, 2, 4];
  const retainedSources = before.sourceMap.filter((source: { page: number }) => retainedPages.includes(source.page));
  const retainedConcepts = before.data.concepts.filter((concept: { pageRefs: number[] }) =>
    concept.pageRefs.some((page) => retainedPages.includes(page)));
  await page.goto(roomPath(id));
  await expect(page.getByRole("heading", { name: before.data.name })).toBeVisible();
  await expect(page.getByRole("main").getByText("Needs attention", { exact: true })).toBeVisible();
  await expect(page.getByText("3 of 4 pages verified.")).toBeVisible();
  await retryRunner.assertLocked(page, id, expect);

  await retryRunner.submitRetry(page, id, before.sourceMap, expect, 700, 3);
  const queued = await fixture("read", id);
  retryRunner.assertOnlyFailedPageQueued(queued, 3, expect);
  await retryRunner.assertMultiDocumentEvidence(queued, expect);
  expect(queued.sourceMap).toEqual(before.sourceMap);
  expect(queued.data.concepts).toEqual(before.data.concepts);
  expect(queued.jobs.find((job: { page: number }) => job.page === 3)).toMatchObject({
    documentId: documents[1].id, localPage: 2,
  });
  for (const pageNumber of retainedPages) {
    expect(queued.jobs.find((job: { page: number }) => job.page === pageNumber).result)
      .toEqual(before.jobs.find((job: { page: number }) => job.page === pageNumber).result);
  }

  const list = await page.request.get("/api/classrooms");
  expect((await list.json()).find((room: { id: string }) => room.id === id).status).toBe("processing");
  await page.reload();
  await retryRunner.assertProcessing(page, id, expect);

  const polled = retryRunner.waitForStatusPoll(page, id, "ready");
  await fixture("ready", id);
  const poll = await polled;
  expect(poll.response.status()).toBe(200);
  expect(poll.body.sourcePages).toHaveLength(4);
  expect(poll.body.sourcePages.find((source: { page: number }) => source.page === 3)).toMatchObject({
    page: 3, documentId: documents[1].id, localPage: 2,
  });

  const after = await fixture("read", id);
  await retryRunner.assertMultiDocumentEvidence(after, expect);
  expect(poll.body.sourcePages).toEqual(after.sourceMap);
  expect(poll.body.concepts).toEqual(after.data.concepts);
  await retryRunner.assertMultiDocumentEvidence({
    data: poll.body, sourceMap: poll.body.sourcePages, jobs: after.jobs,
  }, expect);
  expect(after.sourceMap).toHaveLength(4);
  expect(after.data.status).toBe("ready");
  expect(after.data.coverage).toMatchObject({ pages: 4, mappedPages: 4, figures: 3, tables: 3, flaggedPages: [] });
  for (const source of retainedSources) {
    expect(after.sourceMap.find((candidate: { page: number }) => candidate.page === source.page)).toEqual(source);
  }
  for (const concept of retainedConcepts) {
    expect(after.data.concepts.find((candidate: { id: string }) => candidate.id === concept.id)).toEqual(concept);
  }

  await page.reload();
  await retryRunner.assertReady(page, id, expect, {
    pageCount: 4,
    conceptTitles: [1, 2, 3, 4].map((pageNumber) => `Fixture concept ${pageNumber}`),
  });
  const reloaded = await fixture("read", id);
  await retryRunner.assertMultiDocumentEvidence(reloaded, expect);
  expect(reloaded.sourceMap).toEqual(after.sourceMap);
  const persistedResponse = await page.request.get(`/api/classrooms/${id}`);
  expect(persistedResponse.status()).toBe(200);
  const persisted = await persistedResponse.json();
  expect(persisted.sourcePages).toEqual(after.sourceMap);
  expect(persisted.concepts).toEqual(after.data.concepts);
  await retryRunner.assertMultiDocumentEvidence({
    data: persisted, sourceMap: persisted.sourcePages, jobs: reloaded.jobs,
  }, expect);
});

test("HTTP retry error and exhausted retry remain visible and locked", async ({ page }) => {
  const id = await seed(page);
  const before = await fixture("read", id);
  await page.goto(roomPath(id));
  // A real response is deliberately failed at the boundary; no database mutation.
  await page.route(`**${retryPath(id)}`, (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "Fixture retry service unavailable." }),
  }));
  await page.getByRole("button", { name: "Retry failed pages", exact: true }).click();
  await expect(page.getByText("Could not retry pages", { exact: true })).toBeVisible();
  await expect(page.getByText(/Fixture retry service unavailable/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry failed pages", exact: true })).toBeEnabled();
  expect((await fixture("read", id)).data.status).toBe("needs-attention");
  await locked(page, id);
  await page.unroute(`**${retryPath(id)}`);
  await retryRunner.submitRetry(page, id, before.sourceMap, expect);
  const failedPoll = retryRunner.waitForStatusPoll(page, id, "needs-attention");
  await fixture("failed", id);
  await failedPoll;
  await retryRunner.assertAttention(page, expect, "Page 2: Fixture citations could not be verified. (attempt 3 of 3)");
  await locked(page, id);
  await page.reload();
  await retryRunner.assertAttention(page, expect, "attempt 3 of 3");
});

test("ready classroom returns 409 when no failed pages remain", async ({ page }) => {
  const profile = await page.request.get("/api/profile");
  expect(profile.status()).toBe(200);
  const { id } = await fixture("seed-ready", (await profile.json()).id);
  ids.push(id);
  const before = await fixture("read", id);

  const response = await page.request.post(retryPath(id));
  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({ error: "There are no failed pages to retry." });
  expect(await fixture("read", id)).toEqual(before);
});

test("already-processing classroom rejects another retry without changing evidence", async ({ page }) => {
  const id = await seed(page);
  const before = await fixture("read", id);
  const first = await page.request.post(retryPath(id));
  expect(first.status()).toBe(200);
  expect((await first.json()).sourcePages).toEqual(before.sourceMap);

  const processing = await fixture("read", id);
  expect(processing.data.status).toBe("processing");
  expect(processing.jobs.find((job: { page: number }) => job.page === 1).result).toEqual(before.jobs.find((job: { page: number }) => job.page === 1).result);
  const repeated = await page.request.post(retryPath(id));
  expect(repeated.status()).toBe(409);
  expect(await repeated.json()).toEqual({ error: "There are no failed pages to retry." });
  expect(await fixture("read", id)).toEqual(processing);
});

test("overlapping retry requests queue failed pages only once and retain verified evidence", async ({ page }) => {
  const id = await seed(page);
  const before = await fixture("read", id);
  const responses = await Promise.all([
    page.request.post(retryPath(id)),
    page.request.post(retryPath(id)),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
  const accepted = responses.find((response) => response.status() === 200)!;
  const rejected = responses.find((response) => response.status() === 409)!;
  expect((await accepted.json()).sourcePages).toEqual(before.sourceMap);
  expect(await rejected.json()).toEqual({ error: "There are no failed pages to retry." });

  const after = await fixture("read", id);
  expect(after.data.status).toBe("processing");
  expect(after.sourceMap).toEqual(before.sourceMap);
  expect(after.data.concepts).toEqual(before.data.concepts);
  expect(after.jobs.find((job: { page: number }) => job.page === 1).result).toEqual(before.jobs.find((job: { page: number }) => job.page === 1).result);
  expect(after.jobs.find((job: { page: number }) => job.page === 2)).toMatchObject({ status: "pending", attempts: 0, failure: null });
  expect(after.owner_id ?? after.ownerId).toBe(before.owner_id ?? before.ownerId);
});

test("real endpoint rejects signed-out and non-owner requests without mutation", async ({ page, playwright, baseURL }) => {
  const id = await seed(page, `retry-browser-other-${randomUUID()}`);
  const before = await fixture("read", id);
  const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const unauthorized = await anonymous.post(retryPath(id));
    expect(unauthorized.status()).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "Sign in to access your classrooms." });
  } finally { await anonymous.dispose(); }
  const forbidden = await page.request.post(retryPath(id));
  const missing = await page.request.post(retryPath(randomUUID()));
  expect(forbidden.status()).toBe(404);
  expect(missing.status()).toBe(404);
  expect(await forbidden.json()).toEqual(await missing.json());
  expect(await fixture("read", id)).toEqual(before);
  await page.goto(roomPath(id));
  await expect(page.getByText(/Classroom not found/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry failed pages", exact: true })).toHaveCount(0);
});
