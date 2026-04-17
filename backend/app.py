import asyncio
import json
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from flask_sock import Sock

from services.llm_service import LLMStreamService
from services.country_service import ArticleService
from services.article_preview_service import PreviewService
from services.llm_service import LLMStreamService
from services.speech_service import SpeechService
app = Flask(__name__)
CORS(app)
sock = Sock(app)
service = ArticleService()
preview_service = PreviewService()
speech_service = SpeechService()
llm_stream_service = LLMStreamService()
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/country-click")
def country_click():
    data = request.get_json(silent=True) or {}

    country = data.get("country")
    day = data.get("date")

    if not country:
        return jsonify({"error": "Missing 'country'"}), 400
    if not day:
        return jsonify({"error": "Missing 'date'"}), 400

    rows = service.get_country_rows(country, day)
    return jsonify({"rows": rows})

@app.post("/article-preview")
def article_preview():
    data = request.get_json(silent=True) or {}
    url = data.get("url")

    if not isinstance(url, str) or not url.strip():
        return jsonify({"error": "Missing or invalid 'url'"}), 400

    preview = preview_service.get_preview(url.strip())

    return jsonify(preview)

@app.post("/day-news")
def day_news():
    data = request.get_json(silent=True) or {}
    day = data.get("date")

    if not isinstance(day, str) or not day.strip():
        return jsonify({"error": "Missing or invalid 'date'"}), 400

    rows = service.get_day_rows(day.strip())
    return jsonify({"rows": rows})
@sock.route("/ws-summary")
def ws_summary(ws):
    try:
        data = ws.receive()

        if not data:
            print("No data received")
            return

        try:
            data = json.loads(data)
        except Exception as e:
            print("Invalid JSON:", e)
            return

        urls = data.get("urls", [])

        if not isinstance(urls, list) or not urls:
            ws.send(json.dumps({
                "type": "error",
                "message": "Invalid or empty URLs"
            }))
            return

        print("WS received URLs:", urls)

        asyncio.run(llm_stream_service.stream_pipeline(ws, urls))

        print("pipeline finished cleanly")

    except Exception as e:
        print("ws-summary error:", repr(e))

        try:
            ws.send(json.dumps({
                "type": "error",
                "message": str(e)
            }))
        except Exception:
            pass
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)