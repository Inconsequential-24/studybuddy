# Optional Meta MMS English endpoint

StudyBuddy's read-aloud UI currently uses browser-provided speech voices and does not require this endpoint. Keep this setup only if you intentionally restore server-generated Meta MMS audio.

This endpoint uses Meta's `facebook/mms-tts-eng` checkpoint. Its Hugging Face model card is licensed CC-BY-NC 4.0; use it only for non-commercial purposes unless you have separate permission.

Hugging Face's managed Inference Endpoint task list does not include text-to-speech as a built-in task, so StudyBuddy uses the custom handler in `handler.py`.

## Setup

1. In Hugging Face, duplicate the public model repository `facebook/mms-tts-eng` into a repository you control.
2. Add this `handler.py` file at the root of that model repository. Keep the model's weights and tokenizer files in the repository.
3. Create a Hugging Face Inference Endpoint from your duplicated repository and enable the custom handler. Choose an instance type and scaling policy appropriate to your budget; running endpoints can incur charges.
4. Wait until the endpoint is running, then copy its HTTPS endpoint URL. Do not include a token in the URL.
5. Add that URL as the shared Replit environment variable `HF_MMS_ENDPOINT_URL`. `HF_TOKEN` is already stored securely. The endpoint URL is not needed for the current browser-voice implementation.

The first configured endpoint supports English (`en-US`) only. Other MMS languages use separate checkpoints and require their own endpoint configuration.

## Request and response

StudyBuddy sends `POST {"inputs":"text to read"}` with `Authorization: Bearer <HF_TOKEN>`. The handler returns JSON with base64 WAV audio in `audioContent` and `audio/wav` in `audioMimeType`.
