"""
tts.py — Fish Audio synthesis, one request per sentence chunk.

The response is streamed so time-to-first-byte can be measured; the chunk is
returned whole because the browser decodes one complete MP3 per chunk.

Setting EDGE_TTS_VOICE (e.g. `pt-BR-AntonioNeural`) switches synthesis to
Microsoft's free Edge neural voices via `edge-tts` instead: no API key, same
one-MP3-per-chunk contract.
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx

log = logging.getLogger("jarvis.tts")

FISH_TTS_URL = "https://api.fish.audio/v1/tts"


@dataclass
class SynthResult:
    audio: bytes
    first_byte_sec: float
    total_sec: float


async def synthesize_chunk(text: str, *, api_key: str, voice_id: str,
                           client: Optional[httpx.AsyncClient] = None,
                           latency: str = "balanced", timeout: float = 15.0) -> Optional[SynthResult]:
    text = (text or "").strip()
    if not text:
        return None
    edge_voice = edge_voice_configured()
    if edge_voice:
        return await _synthesize_edge(text, edge_voice, timeout)
    if not api_key:
        return None
    own = client is None
    client = client or httpx.AsyncClient(timeout=timeout)
    t0 = time.monotonic()
    first: Optional[float] = None
    buf = bytearray()
    try:
        async with client.stream(
            "POST", FISH_TTS_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"text": text, "reference_id": voice_id, "format": "mp3", "mp3_bitrate": 128, "latency": latency},
            timeout=timeout,
        ) as resp:
            if resp.status_code != 200:
                log.error(f"TTS {resp.status_code} for {text[:40]!r}")
                return None
            async for part in resp.aiter_bytes():
                if first is None:
                    first = time.monotonic() - t0
                buf.extend(part)
    except (httpx.HTTPError, OSError) as e:
        log.error(f"TTS error: {e}")
        return None
    finally:
        if own:
            try:
                await client.aclose()
            except Exception as e:      # never turn a clean None into an exception
                log.debug(f"TTS client close failed: {e}")
    if not buf:
        return None
    return SynthResult(bytes(buf), first if first is not None else 0.0, time.monotonic() - t0)


def edge_voice_configured() -> str:
    """The Edge voice name when EDGE_TTS_VOICE selects that engine, else ''."""
    return os.getenv("EDGE_TTS_VOICE", "").strip()


async def _synthesize_edge(text: str, voice: str, timeout: float) -> Optional[SynthResult]:
    import asyncio
    try:
        import edge_tts
    except ImportError:
        log.error("EDGE_TTS_VOICE is set but edge-tts is not installed (pip install edge-tts)")
        return None
    t0 = time.monotonic()
    first: Optional[float] = None
    buf = bytearray()

    async def _collect():
        nonlocal first
        async for part in edge_tts.Communicate(text, voice).stream():
            if part["type"] == "audio":
                if first is None:
                    first = time.monotonic() - t0
                buf.extend(part["data"])

    try:
        await asyncio.wait_for(_collect(), timeout)
    except Exception as e:      # network, timeout, or an unknown voice name
        log.error(f"Edge TTS error for {text[:40]!r}: {e}")
        return None
    if not buf:
        return None
    return SynthResult(bytes(buf), first if first is not None else 0.0, time.monotonic() - t0)
