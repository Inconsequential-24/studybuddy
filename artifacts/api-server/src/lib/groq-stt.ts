export type GroqTranscription = { text: string };

type GroqTranscriptionOptions = {
  apiKey: string;
  model: string;
  audio: Buffer;
  mimeType: string;
  filename: string;
  language?: string;
  fetcher?: typeof fetch;
};

export async function transcribeWithGroq({
  apiKey,
  model,
  audio,
  mimeType,
  filename,
  language,
  fetcher = fetch,
}: GroqTranscriptionOptions): Promise<GroqTranscription> {
  const body = new FormData();
  body.append("file", new Blob([Uint8Array.from(audio)], { type: mimeType }), filename);
  body.append("model", model);
  body.append("response_format", "json");
  body.append("temperature", "0");
  if (language) body.append("language", language);

  const response = await fetcher("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Groq did not accept the voice-input credentials. Check GROQ_API_KEY in Replit Secrets.");
    }
    if (response.status === 429) throw new Error("Groq voice input is busy. Please wait a moment and try again.");
    throw new Error("Groq could not transcribe this recording. Please try again.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload !== "object" || payload === null || !("text" in payload) || typeof payload.text !== "string") {
    throw new Error("Groq returned an invalid transcription.");
  }
  return { text: payload.text.trim() };
}
