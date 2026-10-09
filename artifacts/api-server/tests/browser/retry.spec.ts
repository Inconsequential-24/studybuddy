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
  try {
    const results = await Promise.allSettled(ids.map((id) => fixture("cleanup", id)));
    const failures = results.filter((result) => result.status === "rejected");
    expect(failures, "All isolated test classrooms must be cleaned up").toEqual([]);
  }
  finally {
    if (guard && guard.exitCode === null) {
      await new Promise<void>((resolve) => { guard.once("exit", () => resolve()); guard.kill("SIGTERM"); });
    }
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
