/** Fetch rejects with TypeError when no HTTP response reaches the browser. */
export function isConnectionError(error: unknown): boolean {
  return error instanceof TypeError && /failed to fetch|load failed|networkerror|network request failed/i.test(error.message);
}

/** Used only by read queries. Mutations must not be replayed after lost responses. */
export function retryReadRequest(failureCount: number, error: unknown): boolean {
  return failureCount < (isConnectionError(error) ? 3 : 1);
}
