import os
import requests
from flask import Response, stream_with_context

VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"
MODEL_ID = "eleven_flash_v2_5"

class SpeechService:
    def __init__(self):
        self.api_key = os.environ.get("ELEVENLABS_API_KEY")
        if not self.api_key:
            raise ValueError("ELEVENLABS_API_KEY not set")

    def stream_text_to_speech(self, text: str) -> Response:
        eleven_res = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/stream",
            headers={
                "xi-api-key": self.api_key,
                "Content-Type": "application/json",
            },
            params={
                "output_format": "mp3_44100_128",
            },
            json={
                "text": text,
                "model_id": MODEL_ID,
            },
            stream=True,
            timeout=120,
        )

        print("ElevenLabs status:", eleven_res.status_code)
        if not eleven_res.ok:
            print("ElevenLabs error body:", eleven_res.text)

        eleven_res.raise_for_status()

        def generate():
            for chunk in eleven_res.iter_content(chunk_size=4096):
                if chunk:
                    yield chunk

        return Response(
            stream_with_context(generate()),
            mimetype="audio/mpeg",
            headers={"Cache-Control": "no-cache"},
        )
