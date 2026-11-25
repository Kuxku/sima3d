import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import WebSocketDisconnect

from app.services.live_service import GeminiLiveBridge, LiveSessionManager


class _FakeWebSocket:
    def __init__(self, incoming_messages):
        self._incoming = list(incoming_messages)
        self.sent = []
        self.closed = False

    async def receive(self):
        if not self._incoming:
            raise WebSocketDisconnect()
        return self._incoming.pop(0)

    async def send_json(self, payload):
        self.sent.append(payload)

    async def close(self, code=1000):
        self.closed = True


@pytest.mark.anyio
async def test_live_bridge_ignores_invalid_base64_audio():
    ws = _FakeWebSocket([
        {"text": json.dumps({"type": "audio", "data": "!!!not-valid-base64!!!"})},
        {"text": json.dumps({"type": "text", "text": "Hola SIMA"})},
    ])
    session = SimpleNamespace(
        send_realtime_input=AsyncMock(),
        send_client_content=AsyncMock(),
    )
    bridge = GeminiLiveBridge(websocket=ws, session_id="test-b64")
    await bridge._forward_client_to_gemini(session)

    # El frame base64 corrupto se descartó sin tumbar la sesión y el mensaje de texto sí llegó
    assert session.send_realtime_input.call_count == 0
    assert session.send_client_content.call_count == 1


@pytest.mark.anyio
async def test_live_bridge_deduplicates_output_transcription_and_part_text():
    ws = _FakeWebSocket([])

    msg1 = SimpleNamespace(
        tool_call=None,
        server_content=SimpleNamespace(
            interrupted=False,
            output_transcription=SimpleNamespace(text="Enfocando Robledo."),
            model_turn=SimpleNamespace(
                parts=[SimpleNamespace(text="Enfocando Robledo.", thought=False, inline_data=None)]
            ),
            input_transcription=None,
            turn_complete=True,
        ),
    )

    async def _receive_gen():
        yield msg1

    session = SimpleNamespace(receive=_receive_gen)
    bridge = GeminiLiveBridge(websocket=ws, session_id="test-dedup")
    await bridge._forward_gemini_to_client(session)

    text_events = [m for m in ws.sent if m.get("type") == "text"]
    assert len(text_events) == 1
    assert text_events[0]["text"] == "Enfocando Robledo."
    assert any(m.get("type") == "turn_complete" for m in ws.sent)


@pytest.mark.anyio
async def test_live_bridge_error_does_not_leak_raw_exception():
    ws = _FakeWebSocket([])
    bridge = GeminiLiveBridge(websocket=ws, session_id="test-err")

    class _FailingLive:
        def connect(self, **kwargs):
            raise RuntimeError("secret-internal-token-xyz")

    bridge.client = SimpleNamespace(aio=SimpleNamespace(live=_FailingLive()))
    await bridge.run()

    err_events = [m for m in ws.sent if m.get("type") == "error"]
    assert len(err_events) == 1
    assert err_events[0]["code"] == "LIVE_API_ERROR"
    assert "secret-internal-token-xyz" not in err_events[0]["message"]


@pytest.mark.anyio
async def test_live_session_manager_end_session_idempotent():
    mgr = LiveSessionManager()
    assert await mgr.can_start_session("s-1") is True
    assert mgr.active_count == 1
    await mgr.end_session("s-1")
    await mgr.end_session("s-1")  # segunda llamada no falla
    assert mgr.active_count == 0
