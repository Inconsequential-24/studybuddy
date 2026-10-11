---
name: StudyBuddy speech providers
description: Provider roles and licensing constraint for StudyBuddy voice input and read-aloud.
---

StudyBuddy uses Groq for spoken-question transcription and the browser's Speech Synthesis API for read-aloud. Browser voice selection and quality vary by device; do not silently fall back to a paid remote TTS provider.

**Why:** The user chose device-provided speech to avoid hosted TTS charges; Groq's English TTS model is also billed per character, while the Meta MMS model carries a non-commercial license restriction.

**How to apply:** Keep speech input and read-aloud as separate capabilities. Groq remains for speech-to-text only; preserve a clear unavailable state when browser speech synthesis is unsupported. Treat the retained Meta MMS endpoint as optional and do not enable it for commercial use without a licensing review.
