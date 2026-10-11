// Shared retry assertions for Playwright tests and an already-authenticated
// ExecutePlaywrightAction runner page. This file intentionally has no imports.
async function assertLocked(page, id, expect) {
  for (const slug of ["teach", "practice", "exam"]) {
    await expect(page.locator(`a[href^="/classrooms/${id}/${slug}"]`)).toHaveCount(0);
  }
  await expect(page.getByRole("textbox", { name: "Answers use only this classroom's pages." })).toHaveCount(0);
  await expect(page.getByText("Learning activities unlock after every page is verified and concepts are found.")).toBeVisible();
}

async function assertProcessing(page, id, expect) {
  await expect(page.getByRole("main").getByText("Reading your PDFs", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry failed pages", exact: true })).toHaveCount(0);
  await assertLocked(page, id, expect);
}

async function assertReady(page, id, expect, { pageCount = 2, conceptTitles = ["Fixture concept 1"] } = {}) {
  await expect(page.getByRole("main").getByText("Ready", { exact: true })).toBeVisible();
  await expect(page.getByText(`${pageCount} of ${pageCount} pages verified.`)).toBeVisible();
  await expect(page.getByText("No flagged pages.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start teaching" })).toBeVisible();
  for (const title of conceptTitles) {
    await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
  }
  for (const slug of ["teach", "practice", "exam"]) {
    await expect(page.locator(`a[href="/classrooms/${id}/${slug}"]`).first()).toBeVisible();
  }
}

async function assertMultiDocumentEvidence(snapshot, expect) {
  const room = snapshot.data;
  const jobs = [...snapshot.jobs].sort((a, b) => a.page - b.page);
  const pageCount = room.documents.reduce((count, document) => count + document.pageCount, 0);
  expect(jobs.map((job) => job.page)).toEqual(Array.from({ length: pageCount }, (_, index) => index + 1));

  for (const job of jobs) {
    let offset = 0;
    const document = room.documents.find((candidate) => {
      offset += candidate.pageCount;
      return job.page <= offset;
    });
    expect(document, `A document must own global page ${job.page}`).toBeDefined();
    expect(job.documentId, `Job ${job.page} document ID`).toBe(document.id);
    expect(job.localPage, `Job ${job.page} local page`).toBe(job.page - (offset - document.pageCount));
  }

  for (const source of snapshot.sourceMap) {
    const job = jobs.find((candidate) => candidate.page === source.page);
    expect(job, `A job must exist for source page ${source.page}`).toBeDefined();
    expect(source.documentId, `Source page ${source.page} document ID`).toBe(job.documentId);
    expect(source.localPage, `Source page ${source.page} local page`).toBe(job.localPage);
    expect(job.result.source).toEqual(source);
    const concept = room.concepts.find((candidate) => candidate.pageRefs.includes(source.page));
    expect(concept, `A concept must retain page ${source.page}`).toBeDefined();
    for (const figure of source.figures) {
      expect(concept.refs).toContainEqual({
        page: source.page, kind: "figure", sourceId: figure.id, quote: figure.caption,
      });
    }
    for (const table of source.tables) {
      expect(concept.refs).toContainEqual({
        page: source.page, kind: "table", sourceId: table.id, quote: table.caption,
      });
    }
  }
}

function assertOnlyFailedPageQueued(snapshot, failedPage, expect) {
  const jobs = [...snapshot.jobs].sort((a, b) => a.page - b.page);
  expect(jobs.filter((job) => job.status === "pending").map((job) => job.page)).toEqual([failedPage]);
  for (const job of jobs) {
    if (job.page === failedPage) {
      expect(job).toMatchObject({
        status: "pending", attempts: 0, failure: null, result: null,
      });
    } else {
      expect(job.status, `Previously verified page ${job.page} must not be queued`).toBe("succeeded");
    }
  }
}

async function assertAttention(page, expect, errorText) {
  await expect(page.getByRole("main").getByText("Needs attention", { exact: true })).toBeVisible();
  if (errorText) await expect(page.getByRole("list", { name: "Page analysis errors" })).toContainText(errorText);
  await expect(page.getByRole("button", { name: "Retry failed pages", exact: true })).toBeEnabled();
}

function waitForStatusPoll(page, id, status) {
  let matchingBody;
  return page.waitForResponse(async (response) => {
    if (!response.url().endsWith(`/api/classrooms/${id}`) || response.request().method() !== "GET") return false;
    const body = await response.json();
    if (body.status !== status) return false;
    matchingBody = body;
    return true;
  }, { timeout: 20000 }).then((response) => ({ response, body: matchingBody }));
}

async function submitRetry(page, id, sourceMap, expect, delayMs = 700, expectedMappedPages = 1) {
  const retryUrl = `/api/classrooms/${id}/retry-failed-pages`;
  // Delay before forwarding so the original browser request (including Clerk
  // auth) is continued intact; route.fetch() drops runner auth in this setup.
  await page.route(`**${retryUrl}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  }, { times: 1 });
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith(retryUrl) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Retry failed pages", exact: true }).click();
  await expect(page.getByRole("button", { name: "Scheduling retry…" })).toBeDisabled();
  const response = await responsePromise;
  const body = await response.json();
  expect(response.status()).toBe(200);
  expect(body.status).toBe("processing");
  expect(body.coverage.mappedPages).toBe(expectedMappedPages);
  expect(body.sourcePages).toEqual(sourceMap);
  await assertProcessing(page, id, expect);
  return { response, body };
}

module.exports = {
  assertLocked, assertProcessing, assertReady, assertAttention, waitForStatusPoll, submitRetry,
  assertMultiDocumentEvidence, assertOnlyFailedPageQueued,
};
