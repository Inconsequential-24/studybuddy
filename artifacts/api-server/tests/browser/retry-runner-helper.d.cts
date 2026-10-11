import type { Page, Response, expect as playwrightExpect } from "@playwright/test";

declare const retryRunner: {
  assertLocked(page: Page, id: string, expect: typeof playwrightExpect): Promise<void>;
  assertProcessing(page: Page, id: string, expect: typeof playwrightExpect): Promise<void>;
  assertReady(page: Page, id: string, expect: typeof playwrightExpect, options?: { pageCount?: number; conceptTitles?: string[] }): Promise<void>;
  assertAttention(page: Page, expect: typeof playwrightExpect, errorText?: string): Promise<void>;
  waitForStatusPoll(page: Page, id: string, status: string): Promise<{ response: Response; body: any }>;
  submitRetry(page: Page, id: string, sourceMap: unknown, expect: typeof playwrightExpect, delayMs?: number, expectedMappedPages?: number): Promise<{ response: Response; body: any }>;
  assertMultiDocumentEvidence(snapshot: any, expect: typeof playwrightExpect): Promise<void>;
  assertOnlyFailedPageQueued(snapshot: any, failedPage: number, expect: typeof playwrightExpect): void;
};
export = retryRunner;
