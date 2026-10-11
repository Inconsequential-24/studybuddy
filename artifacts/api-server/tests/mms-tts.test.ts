import assert from "node:assert/strict";
import test from "node:test";
import { synthesizeMmsSpeech } from "../src/lib/mms-tts.ts";

test("sends text to the secure dedicated Hugging Face endpoint and returns WAV audio", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const audioContent = Buffer.from("RIFF-test-wav").toString("base64");

  const result = await synthesizeMmsSpeech({
    endpointUrl: "https://studybuddy.endpoints.huggingface.cloud",
    token: "test-token",
    text: "Hello learner.",
    fetcher: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return Response.json({ audioContent, audioMimeType: "audio/wav" });
    },
  });

  assert.equal(capturedUrl, "https://studybuddy.endpoints.huggingface.cloud/");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(new Headers(capturedInit?.headers).get("authorization"), "Bearer test-token");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), { inputs: "Hello learner." });
  assert.deepEqual(result, { audioContent, audioMimeType: "audio/wav" });
});

test("rejects non-Hugging Face or insecure endpoint URLs before sending a request", async () => {
  await assert.rejects(
    synthesizeMmsSpeech({
      endpointUrl: "http://localhost:8080",
      token: "test-token",
      text: "Hello learner.",
      fetcher: async () => { throw new Error("must not fetch"); },
    }),
    /secure Hugging Face Inference Endpoint/,
  );
});

test("rejects unexpected endpoint response formats", async () => {
  await assert.rejects(
    synthesizeMmsSpeech({
      endpointUrl: "https://studybuddy.endpoints.huggingface.cloud",
      token: "test-token",
      text: "Hello learner.",
      fetcher: async () => Response.json({ generated_text: "not audio" }),
    }),
    /unsupported audio format/,
  );
});

test("returns a retryable message while the endpoint is starting", async () => {
  await assert.rejects(
    synthesizeMmsSpeech({
      endpointUrl: "https://studybuddy.endpoints.huggingface.cloud",
      token: "test-token",
      text: "Hello learner.",
      fetcher: async () => new Response("", { status: 503 }),
    }),
    /starting or temporarily unavailable/,
  );
});
