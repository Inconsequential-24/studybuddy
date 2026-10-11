import assert from "node:assert/strict";
import test from "node:test";
import { transcribeWithGroq } from "../src/lib/groq-stt.ts";

test("sends audio and the selected Whisper model to Groq and returns transcription text", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const result = await transcribeWithGroq({
    apiKey: "test-token",
    model: "whisper-large-v3-turbo",
    audio: Buffer.from("recorded audio"),
    mimeType: "audio/webm",
    filename: "recording.webm",
    language: "en",
    fetcher: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return Response.json({ text: "  What is photosynthesis?  " });
    },
  });

  assert.equal(capturedUrl, "https://api.groq.com/openai/v1/audio/transcriptions");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(new Headers(capturedInit?.headers).get("authorization"), "Bearer test-token");
  assert.ok(capturedInit?.body instanceof FormData);
  const form = capturedInit.body as FormData;
  assert.equal(form.get("model"), "whisper-large-v3-turbo");
  assert.equal(form.get("language"), "en");
  assert.equal(form.get("response_format"), "json");
  assert.deepEqual(result, { text: "What is photosynthesis?" });
});

test("does not expose upstream error bodies when Groq rejects the token", async () => {
  await assert.rejects(
    transcribeWithGroq({
      apiKey: "test-token",
      model: "whisper-large-v3-turbo",
      audio: Buffer.from("recorded audio"),
      mimeType: "audio/webm",
      filename: "recording.webm",
      fetcher: async () => new Response("private provider detail", { status: 401 }),
    }),
    /did not accept the voice-input credentials/,
  );
});
