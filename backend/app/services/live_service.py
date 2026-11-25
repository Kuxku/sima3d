import asyncio
import base64
import binascii
import json
import logging
import time
from typing import Optional, Set
from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from app.core.config import settings
from app.services.action_registry import action_registry
from app.services.context_builder import ContextBuilder

logger = logging.getLogger(__name__)


class LiveSessionManager:
    """
    Gestiona el ciclo de vida, concurrencia, límites de duración
    y puente seguro WebSocket <-> Gemini Multimodal Live API.
    """

    def __init__(self):
        self._active_sessions: Set[str] = set()
        self._lock = asyncio.Lock()

    async def can_start_session(self, session_id: str) -> bool:
        async with self._lock:
            if len(self._active_sessions) >= settings.VOICE_LIVE_MAX_CONCURRENT_SESSIONS:
                return False
            self._active_sessions.add(session_id)
            return True

    async def end_session(self, session_id: str):
        async with self._lock:
            if session_id in self._active_sessions:
                self._active_sessions.discard(session_id)
                logger.info(
                    f"Sesión Live {session_id} finalizada. Sesiones activas: {len(self._active_sessions)}"
                )

    @property
    def active_count(self) -> int:
        return len(self._active_sessions)


live_session_manager = LiveSessionManager()


class GeminiLiveBridge:
    def __init__(self, websocket: WebSocket, session_id: str):
        self.websocket = websocket
        self.session_id = session_id
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.start_time = time.time()
        self.last_activity = time.time()
        self.is_running = True

    async def run(self, selected_node_id: Optional[str] = None):
        """
        Ejecuta el puente bidireccional entre el WebSocket del cliente y Gemini Live.
        La liberación de concurrencia (`end_session`) es responsabilidad del router WebSocket.
        """
        network_context = ContextBuilder.build_network_context()
        sys_instruction = (
            "Eres Jarvis, el asistente de voz inteligente y ejecutivo de SIMA-3D Medellín.\n"
            "Tu objetivo es ayudar a directivos y analistas a explorar visualmente la red 3D de movilidad estudiantil de forma oral y concisa.\n"
            "REGLAS CRÍTICAS DE ACCIÓN Y VISUALIZACIÓN EN TIEMPO REAL:\n"
            "1. CADA VEZ que el usuario pregunte o mencione comunas, colegios, facultades o categorías:\n"
            "   - DEBES INVOCAR INMEDIATAMENTE una de las herramientas visuales ANTES o DURANTE tu explicación:\n"
            "     * Si menciona una entidad puntual (ej: Robledo, Ingeniería, San José): invoca 'focus_node' con su ID exacto o coincidencia más cercana.\n"
            "     * Si menciona un grupo o ranking (ej: 'las 3 comunas con más flujo', 'colegios destacados'): invoca 'highlight_nodes' pasando los IDs correspondientes.\n"
            "     * Si menciona un tipo de entidad (ej: 'muestra facultades', 'ver comunas'): invoca 'filter_by_type' con 'facultad', 'comuna' o 'colegio'.\n"
            "     * Si pide resetear o ver el panorama general: invoca 'reset_view'.\n"
            "2. Responde SIEMPRE en español de Colombia, con tono ejecutivo, profesional y ultra-conciso (máximo 1 o 2 oraciones breves).\n"
            "3. Basa todas tus afirmaciones estrictamente en los datos del contexto topológico proporcionado. Nunca inventes cifras.\n"
            "   Solo menciona posiciones ('la segunda', 'la quinta'...) si aparecen literalmente en RANKINGS o en el campo 'ranking' de la herramienta; si no, menciona solo el volumen.\n"
            "4. NUNCA hables en inglés ni menciones tu proceso de pensamiento o herramientas internas. Habla directo al grano.\n"
            "5. ORDEN DEL TURNO: invoca la herramienta visual de inmediato y responde con UNA sola intervención usando los datos del contexto. Nunca repitas una frase.\n\n"
            f"CONTEXTO TOPOLÓGICO ACTUAL:\n{network_context}"
        )

        if selected_node_id and selected_node_id != "string":
            sys_instruction += f"\n\nEL USUARIO TIENE SELECCIONADO EL NODO ID: {selected_node_id}"

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            max_output_tokens=settings.GEMINI_LIVE_MAX_OUTPUT_TOKENS,
            temperature=settings.GEMINI_TEMPERATURE,
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=settings.GEMINI_LIVE_VOICE_NAME
                    )
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part.from_text(text=sys_instruction)]
            ),
            tools=action_registry.get_gemini_tools(non_blocking=True),
        )

        logger.info(
            f"Iniciando Gemini Live session {self.session_id} con modelo {settings.GEMINI_LIVE_MODEL}"
        )

        try:
            async with self.client.aio.live.connect(
                model=settings.GEMINI_LIVE_MODEL,
                config=config,
            ) as session:
                await self.websocket.send_json({
                    "type": "session_started",
                    "session_id": self.session_id,
                    "model": settings.GEMINI_LIVE_MODEL,
                    "max_duration_seconds": settings.VOICE_LIVE_MAX_DURATION_SECONDS,
                })

                client_to_gemini = asyncio.create_task(self._forward_client_to_gemini(session))
                gemini_to_client = asyncio.create_task(self._forward_gemini_to_client(session))
                watchdog = asyncio.create_task(self._session_watchdog())

                _, pending = await asyncio.wait(
                    [client_to_gemini, gemini_to_client, watchdog],
                    return_when=asyncio.FIRST_COMPLETED,
                )

                for t in pending:
                    t.cancel()
                if pending:
                    await asyncio.gather(*pending, return_exceptions=True)

        except Exception as e:
            logger.error(f"Error en sesión Live {self.session_id}: {e}", exc_info=True)
            try:
                await self.websocket.send_json({
                    "type": "error",
                    "code": "LIVE_API_ERROR",
                    "message": "No fue posible mantener la conexión de voz en tiempo real. Intenta nuevamente.",
                })
            except Exception:
                pass
        finally:
            self.is_running = False
            try:
                await self.websocket.send_json({
                    "type": "session_closed",
                    "reason": "finished",
                })
                await self.websocket.close()
            except Exception:
                pass

    async def _forward_client_to_gemini(self, session):
        """Lee datos del WebSocket (audio PCM 16kHz o comandos) y los transmite a Gemini."""
        while self.is_running:
            try:
                msg = await self.websocket.receive()
                self.last_activity = time.time()

                # Caso 1: Frame binario (Audio PCM 16-bit 16kHz directo)
                if "bytes" in msg and msg["bytes"]:
                    pcm_bytes = msg["bytes"]
                    await session.send_realtime_input(
                        audio=types.Blob(
                            data=pcm_bytes,
                            mime_type="audio/pcm;rate=16000",
                        )
                    )

                # Caso 2: Frame JSON
                elif "text" in msg and msg["text"]:
                    data = msg.get("text")
                    try:
                        payload = json.loads(data)
                        msg_type = payload.get("type")

                        if msg_type == "audio":
                            raw_b64 = payload.get("data", "")
                            try:
                                pcm_bytes = base64.b64decode(raw_b64, validate=True)
                            except (binascii.Error, ValueError, TypeError):
                                logger.warning(
                                    f"Frame de audio base64 inválido descartado en sesión {self.session_id}"
                                )
                                continue
                            await session.send_realtime_input(
                                audio=types.Blob(
                                    data=pcm_bytes,
                                    mime_type="audio/pcm;rate=16000",
                                )
                            )

                        elif msg_type == "text":
                            user_text = str(payload.get("text", "")).strip()
                            if user_text:
                                await session.send_client_content(
                                    turns=[
                                        types.Content(
                                            role="user",
                                            parts=[types.Part.from_text(text=user_text)],
                                        )
                                    ],
                                    turn_complete=True,
                                )

                        elif msg_type == "interrupt":
                            logger.info(
                                f"Interrupción manual recibida del cliente en {self.session_id}"
                            )

                        elif msg_type == "finish_speaking":
                            logger.info(f"Cliente indicó fin de habla en {self.session_id}")
                            try:
                                await session.send_realtime_input(audio_stream_end=True)
                            except Exception as err:
                                logger.warning(f"Error enviando audio_stream_end: {err}")

                    except json.JSONDecodeError:
                        logger.warning("Mensaje JSON inválido recibido por WebSocket")

            except WebSocketDisconnect:
                logger.info(f"WebSocket desconectado por el cliente {self.session_id}")
                self.is_running = False
                break
            except Exception as e:
                logger.error(f"Error procesando entrada del cliente: {e}")
                break

    async def _forward_gemini_to_client(self, session):
        """Lee eventos de Gemini Live y los reenvía estructurados al cliente WebSocket."""
        saw_output_transcription = False
        try:
            async for server_msg in session.receive():
                if not self.is_running:
                    break

                self.last_activity = time.time()

                # 1. Manejo de Tool Calls (Acciones sobre el grafo)
                if server_msg.tool_call and server_msg.tool_call.function_calls:
                    for fc in server_msg.tool_call.function_calls:
                        logger.info(f"Live Gemini invoca acción: {fc.name} con args: {fc.args}")
                        result = action_registry.execute(fc.name, fc.args or {})

                        await self.websocket.send_json({
                            "type": "action",
                            "action": result.action,
                            "args": result.args,
                            "confirmation": result.confirmation,
                            "result": result.data,
                            "camera_command": result.camera_command,
                            "highlighted_node_ids": result.highlighted_node_ids,
                        })

                        await session.send_tool_response(
                            function_responses=[
                                types.FunctionResponse(
                                    id=fc.id,
                                    name=fc.name,
                                    scheduling=types.FunctionResponseScheduling.SILENT,
                                    response={
                                        "result": result.data,
                                        "confirmation": result.confirmation,
                                    },
                                )
                            ]
                        )

                # 2. Contenido del Servidor (Audio PCM 24kHz, texto y transcripciones)
                if server_msg.server_content:
                    content = server_msg.server_content

                    if content.interrupted:
                        logger.info("Gemini Live reporta interrupción por habla del usuario")
                        saw_output_transcription = False
                        await self.websocket.send_json({"type": "interrupted"})

                    # Transcripción del audio de salida (fuente prioritaria en modalidad AUDIO)
                    has_out_tx_in_msg = False
                    if content.output_transcription:
                        out_text = (
                            content.output_transcription.text
                            if hasattr(content.output_transcription, "text")
                            else str(content.output_transcription)
                        )
                        if out_text:
                            has_out_tx_in_msg = True
                            saw_output_transcription = True
                            await self.websocket.send_json({
                                "type": "text",
                                "text": out_text,
                            })

                    # Turno del modelo (audio PCM y fallback de texto solo si no hay output_transcription)
                    if content.model_turn and content.model_turn.parts:
                        for part in content.model_turn.parts:
                            if (
                                part.text
                                and not getattr(part, "thought", False)
                                and not has_out_tx_in_msg
                                and not saw_output_transcription
                            ):
                                await self.websocket.send_json({
                                    "type": "text",
                                    "text": part.text,
                                })

                            if part.inline_data and part.inline_data.data:
                                audio_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                                await self.websocket.send_json({
                                    "type": "audio",
                                    "data": audio_b64,
                                    "mime_type": part.inline_data.mime_type or "audio/pcm;rate=24000",
                                })

                    if content.input_transcription:
                        in_text = (
                            content.input_transcription.text
                            if hasattr(content.input_transcription, "text")
                            else str(content.input_transcription)
                        )
                        if in_text:
                            await self.websocket.send_json({
                                "type": "user_transcript",
                                "text": in_text,
                            })

                    if content.turn_complete:
                        saw_output_transcription = False
                        await self.websocket.send_json({"type": "turn_complete"})

        except Exception as e:
            if self.is_running:
                logger.error(f"Error en lectura de Gemini Live: {e}")

    async def _session_watchdog(self):
        """Monitorea duración máxima e inactividad de la sesión Live."""
        warning_sent = False
        while self.is_running:
            await asyncio.sleep(5)
            elapsed = time.time() - self.start_time
            inactive_time = time.time() - self.last_activity

            remaining = settings.VOICE_LIVE_MAX_DURATION_SECONDS - elapsed
            if remaining <= 120 and not warning_sent and remaining > 0:
                warning_sent = True
                await self.websocket.send_json({
                    "type": "session_warning",
                    "message": f"La sesión Live se cerrará en {int(remaining)} segundos por límite de duración.",
                })

            if elapsed >= settings.VOICE_LIVE_MAX_DURATION_SECONDS:
                logger.warning(
                    f"Sesión Live {self.session_id} alcanzó el límite de {settings.VOICE_LIVE_MAX_DURATION_SECONDS}s"
                )
                await self.websocket.send_json({
                    "type": "session_warning",
                    "message": "Duración máxima de sesión alcanzada. Cerrando conexión de forma ordenada.",
                })
                break

            if inactive_time >= settings.VOICE_LIVE_INACTIVITY_TIMEOUT_SECONDS:
                logger.info(
                    f"Sesión Live {self.session_id} cerrada por inactividad ({inactive_time:.0f}s)"
                )
                await self.websocket.send_json({
                    "type": "session_warning",
                    "message": "Sesión cerrada por inactividad.",
                })
                break
