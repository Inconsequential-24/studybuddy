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

async function assertReady(page, id, expect) {
  await expect(page.getByRole("main").getByText("Ready", { exact: true })).toBeVisible();
  await expect(page.getByText("2 of 2 pages verified.")).toBeVisible();
  await expect(page.getByText("No flagged pages.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start teaching" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fixture concept 1" })).toBeVisible();
  for (const slug of ["teach", "practice", "exam"]) {
    await expect(page.locator(`a[href="/classrooms/${id}/${slug}"]`).first()).toBeVisible();
  }
}

async function assertAttention(page, expect, errorText) {
  await expect(page.getByRole("main").getByText("Needs attention", { exact: true })).toBeVisible();
  if (errorText) await expect(page.getByRole("list", { name: "Page analysis errors" })).toContainText(errorText);
  await expect(page.getByRole("button", { name: "Retry failed pages", exact: true })).toBeEnabled();
}

function waitForStatusPoll(page, id, status) {
  return page.waitForResponse(async (response) =>
    response.url().endsWith(`/api/classrooms/${id}`) &&
    response.request().method() === "GET" &&
    (await response.json()).status === status,
  { timeout: 20000 });
}

async function submitRetry(page, id, sourceMap, expect, delayMs = 700) {
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
  expect(body.coverage.mappedPages).toBe(1);
  expect(body.sourcePages).toEqual(sourceMap);
  await assertProcessing(page, id, expect);
  return { response, body };
}

module.exports = { assertLocked, assertProcessing, assertReady, assertAttention, waitForStatusPoll, submitRetry };
