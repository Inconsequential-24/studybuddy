export type MmsSpeechAudio = {
  audioContent: string;
  audioMimeType: "audio/wav" | "audio/mpeg";
};

type MmsSpeechOptions = {
  endpointUrl: string;
  token: string;
  text: string;
  fetcher?: typeof fetch;
};

const AUDIO_MIME_TYPES = new Set<MmsSpeechAudio["audioMimeType"]>(["audio/wav", "audio/mpeg"]);
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

export async function synthesizeMmsSpeech({
  endpointUrl,
  token,
  text,
  fetcher = fetch,
}: MmsSpeechOptions): Promise<MmsSpeechAudio> {
  const endpoint = new URL(endpointUrl);
  if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".endpoints.huggingface.cloud")) {
    throw new Error("The Meta MMS endpoint URL must be a secure Hugging Face Inference Endpoint.");
  }

  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ inputs: text }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Meta MMS is busy. Please wait a moment and try again.");
    if (response.status === 503) throw new Error("The Meta MMS endpoint is starting or temporarily unavailable. Please try again shortly.");
    throw new Error("Meta MMS could not create audio. Check that the endpoint is running and uses the StudyBuddy handler.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Meta MMS returned an invalid audio response.");
  }

  const audioContent = "audioContent" in payload ? payload.audioContent : undefined;
  const audioMimeType = "audioMimeType" in payload ? payload.audioMimeType : undefined;
  if (typeof audioContent !== "string" || !AUDIO_MIME_TYPES.has(audioMimeType as MmsSpeechAudio["audioMimeType"])) {
    throw new Error("Meta MMS returned an unsupported audio format.");
  }

  if (audioContent.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 4) {
    throw new Error("Meta MMS returned invalid or oversized audio.");
  }
  const bytes = Buffer.from(audioContent, "base64");
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES || bytes.toString("base64") !== audioContent) {
    throw new Error("Meta MMS returned invalid or oversized audio.");
  }

  return { audioContent, audioMimeType: audioMimeType as MmsSpeechAudio["audioMimeType"] };
}
