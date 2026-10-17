"""Smoke-test the live interview end to end with synthetic borrower speech.

Generates the borrower's answers with Gemini TTS, streams them into /ws/interview/{id} at real-time pace,
and prints the transcript and the facts the interviewer records.

Usage: uv run python eval/interview_smoke.py --base ws://localhost:8080 --app <application id> [--lang id]
"""

from __future__ import annotations

import argparse
import asyncio
import audioop  # noqa: deprecated in 3.13; fine on 3.12 for a test harness
import io
import json
import wave

import websockets
from google.genai import types

from app.genai import client

ANSWERS = {
    "id": ["Iya, boleh, silakan.", "Saya sudah buka warung ini dua belas tahun.",
           "Biasanya sehari laku sekitar empat ratus lima puluh ribu.",
           "Pertengahan bulan orang belum gajian, jadi pembeli sepi.",
           "Saya mau beli stok untuk Lebaran.", "Suami saya kerja jadi tukang ojek."],
    "ta": ["சரி, கேளுங்கள்.", "பன்னிரண்டு வருஷமா இந்தக் கடை நடத்துறேன்.",
           "சாதாரண நாள்ல ஐயாயிரம் ரூபாய் விற்பனை ஆகும்.",
           "மாசத்தோட நடுவுல சம்பளம் வராது, அதனால விற்பனை குறையும்.",
           "தீபாவளிக்கு சரக்கு வாங்கணும்.", "என் மனைவி தையல் வேலை செய்றாங்க."],
}


async def speech(text: str, lang: str) -> bytes:
    resp = await client().aio.models.generate_content(
        model="gemini-3.8-flash-tts", contents=text,
        config=types.GenerateContentConfig(response_modalities=["AUDIO"], speech_config=types.SpeechConfig(
            language_code={"id": "id-ID", "ta": "ta-IN"}[lang],
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Puck")))))
    data = resp.candidates[0].content.parts[0].inline_data.data
    if data[:4] == b"RIFF":
        with wave.open(io.BytesIO(data)) as w:
            rate, pcm = w.getframerate(), w.readframes(w.getnframes())
    else:
        rate, pcm = 24000, data
    pcm16k, _ = audioop.ratecv(pcm, 2, 1, rate, 16000, None)
    return pcm16k


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="ws://localhost:8080")
    ap.add_argument("--app", required=True)
    ap.add_argument("--lang", default="id")
    args = ap.parse_args()
    clips = await asyncio.gather(*(speech(t, args.lang) for t in ANSWERS[args.lang]))
    silence = b"\x00\x00" * 1600  # 100 ms

    async with websockets.connect(f"{args.base}/ws/interview/{args.app}?lang={args.lang}", max_size=None) as ws:
        agent_turn_done = asyncio.Event()
        agent_text: list[str] = []

        async def reader() -> None:
            async for msg in ws:
                if isinstance(msg, bytes):
                    agent_turn_done.clear()
                    continue
                m = json.loads(msg)
                if m["type"] == "transcript":
                    if m["role"] == "agent":
                        agent_text.append(m["text"])
                    else:
                        print(f"   [borrower] {m['text']}")
                    if m["role"] == "agent" and m["final"]:
                        print(f"   [agent] {''.join(agent_text).strip()}")
                        agent_text.clear()
                elif m["type"] == "fact":
                    f = m["fact"]
                    print(f"   FACT {f['field']}: {f['value']}  «{f['quote']}»")
                elif m["type"] in ("done", "error"):
                    print("  ", m["type"], m.get("message", ""), f"{len(m.get('facts', []))} facts")
                    return

        async def pump_silence_until_quiet(seconds: float) -> None:
            for _ in range(int(seconds * 10)):
                if read_task.done():
                    return
                await ws.send(silence)
                await asyncio.sleep(0.1)

        read_task = asyncio.create_task(reader())
        await pump_silence_until_quiet(9)
        for clip in clips:
            for i in range(0, len(clip), 3200):
                if read_task.done():
                    break
                await ws.send(clip[i:i + 3200])
                await asyncio.sleep(0.1)
            await pump_silence_until_quiet(9)
            if read_task.done():
                break
        if not read_task.done():
            await ws.send(json.dumps({"type": "end"}))
        await asyncio.wait_for(read_task, timeout=30)


if __name__ == "__main__":
    asyncio.run(main())
