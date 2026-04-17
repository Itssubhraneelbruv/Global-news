import os
import json
import asyncio
import websockets
from groq import Groq


class LLMStreamService:
    def __init__(self):
        self.groq = Groq(api_key=os.environ["GROQ_API_KEY"])
        self.voice_id = "JBFqnCBsd6RMkjVDRZzb"
        self.eleven_model = "eleven_flash_v2_5"

    def should_flush(self, buffer: str):
        if len(buffer.strip()) < 30:
            return False
        return buffer.endswith((".", "!", "?", ",")) or len(buffer) > 120

    async def stream_pipeline(self, client_ws, urls):
        prompt = f"""
    Summarize the main themes from these news URLs.
    Act as if you are a news anchor giving a brief spoken news summary based on these articles.
    Return only one short spoken-news paragraph.
    Maximum 100 words.
    No bullet points.
    No sections.
    Be concise and factual.
    Speak with the country-level context in mind.

    URLs:
    {chr(10).join(f"- {u}" for u in urls)}
    """

        eleven_url = (
            f"wss://api.elevenlabs.io/v1/text-to-speech/"
            f"{self.voice_id}/stream-input?model_id={self.eleven_model}"
        )

        async with websockets.connect(eleven_url) as eleven_ws:
            audio_task = None

            try:
                await eleven_ws.send(json.dumps({
                    "text": " ",
                    "xi_api_key": os.environ["ELEVENLABS_API_KEY"]
                }))

                async def recv_audio():
                    try:
                        while True:
                            msg = await eleven_ws.recv()
                            data = json.loads(msg)

                            if data.get("audio"):
                                client_ws.send(json.dumps({
                                    "type": "audio",
                                    "data": data["audio"]
                                }))

                            if data.get("isFinal"):
                                break

                    except Exception as e:
                        try:
                            client_ws.send(json.dumps({
                                "type": "audio_error",
                                "message": str(e)
                            }))
                        except Exception:
                            pass
                        raise

                audio_task = asyncio.create_task(recv_audio())

                stream = self.groq.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[
                        {"role": "system", "content": "You are a concise news summarizer."},
                        {"role": "user", "content": prompt},
                    ],
                    stream=True,
                )

                buffer = ""

                for chunk in stream:
                    delta = chunk.choices[0].delta.content or ""
                    if not delta:
                        continue

                    buffer += delta

                    client_ws.send(json.dumps({
                        "type": "text",
                        "delta": delta
                    }))

                    if self.should_flush(buffer):
                        await eleven_ws.send(json.dumps({
                            "text": buffer,
                            "try_trigger_generation": True
                        }))
                        buffer = ""

                if buffer.strip():
                    await eleven_ws.send(json.dumps({
                        "text": buffer,
                        "try_trigger_generation": True
                    }))

                await eleven_ws.send(json.dumps({
                    "text": ""
                }))

                await audio_task

                client_ws.send(json.dumps({
                    "type": "done"
                }))

            except Exception as e:
                try:
                    client_ws.send(json.dumps({
                        "type": "error",
                        "message": str(e)
                    }))
                except Exception:
                    pass
                raise
