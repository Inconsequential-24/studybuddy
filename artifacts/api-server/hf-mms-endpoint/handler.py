import base64
import io
import wave
from typing import Any, Dict

import numpy as np
import torch
from transformers import AutoTokenizer, VitsModel


class EndpointHandler:
    """English MMS-TTS handler for a Hugging Face Inference Endpoint."""

    def __init__(self, path: str = ""):
        self.tokenizer = AutoTokenizer.from_pretrained(path)
        self.model = VitsModel.from_pretrained(path)
        self.sample_rate = self.model.config.sampling_rate
        self.model.eval()

    def __call__(self, data: Dict[str, Any]) -> Dict[str, str]:
        text = data.get("inputs")
        if not isinstance(text, str) or not text.strip() or len(text) > 4500:
            raise ValueError("inputs must be a non-empty string of at most 4500 characters")

        tokens = self.tokenizer(text.strip(), return_tensors="pt")
        with torch.inference_mode():
            waveform = self.model(**tokens).waveform[0].cpu().numpy()

        pcm = (np.clip(waveform, -1.0, 1.0) * 32767).astype("<i2")
        audio = io.BytesIO()
        with wave.open(audio, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(self.sample_rate)
            wav.writeframes(pcm.tobytes())

        return {
            "audioContent": base64.b64encode(audio.getvalue()).decode("ascii"),
            "audioMimeType": "audio/wav",
        }
