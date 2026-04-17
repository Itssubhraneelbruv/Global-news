import requests

class PreviewService:
    def __init__(self):
        pass

    def get_preview(self, url: str) -> dict:
        try:
            response = requests.get(
                "https://api.microlink.io/",
                params={"url": url},
                timeout=8
            )
            response.raise_for_status()
            payload = response.json()

            if payload.get("status") != "success":
                return {
                    "url": url,
                    "error": "Microlink failed",
                    "raw": payload
                }

            data = payload.get("data", {})

            return {
                "url": url,
                "title": data.get("title"),
                "description": data.get("description"),
                "publisher": data.get("publisher"),
                "image": (data.get("image") or {}).get("url"),
                "logo": (data.get("logo") or {}).get("url"),
            }

        except Exception as e:
            return {
                "url": url,
                "error": str(e)
            }