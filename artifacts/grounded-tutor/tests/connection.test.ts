import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { isConnectionError, retryReadRequest } from '../src/lib/connection';

test('recognizes browser network failures, not ordinary application errors', () => {
  for (const message of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
    assert.equal(isConnectionError(new TypeError(message)), true);
  }
  assert.equal(isConnectionError(new Error('Some pages could not be verified')), false);
  assert.equal(isConnectionError(new TypeError('Cannot read properties of undefined')), false);
  assert.equal(retryReadRequest(3, new TypeError('Failed to fetch')), false);
});

test('an interrupted read recovers automatically within the bounded retry budget', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: retryReadRequest, retryDelay: 0 } } });
  let calls = 0;
  try {
    const result = await client.fetchQuery({ queryKey: ['connection-recovery-test'], queryFn: async () => {
      if (++calls < 4) throw new TypeError('Failed to fetch');
      return 'loaded';
    } });
    assert.equal(result, 'loaded');
    assert.equal(calls, 4);
  } finally { client.clear(); }
});

test('mutations are not automatically resubmitted after a lost response', async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let calls = 0;
  try {
    const mutation = client.getMutationCache().build(client, { mutationFn: async () => {
      calls++;
      throw new TypeError('Failed to fetch');
    } });
    await assert.rejects(mutation.execute(undefined), /Failed to fetch/);
    assert.equal(calls, 1);
  } finally { client.clear(); }
});
