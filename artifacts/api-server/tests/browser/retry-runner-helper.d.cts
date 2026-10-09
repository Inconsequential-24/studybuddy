import type { Page, Response, expect as playwrightExpect } from "@playwright/test";

declare const retryRunner: {
  assertLocked(page: Page, id: string, expect: typeof playwrightExpect): Promise<void>;
  assertProcessing(page: Page, id: string, expect: typeof playwrightExpect): Promise<void>;
  assertReady(page: Page, id: string, expect: typeof playwrightExpect): Promise<void>;
  assertAttention(page: Page, expect: typeof playwrightExpect, errorText?: string): Promise<void>;
  waitForStatusPoll(page: Page, id: string, status: string): Promise<Response>;
  submitRetry(page: Page, id: string, sourceMap: unknown, expect: typeof playwrightExpect, delayMs?: number): Promise<{ response: Response; body: unknown }>;
};
export = retryRunner;
