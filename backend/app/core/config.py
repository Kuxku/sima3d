from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "SIMA-3D API"
    VERSION: str = "1.0.0"
    
    # API & CORS
    API_V1_STR: str = "/api"
    CORS_ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
    
    # Paths
    GRAPH_DATA_PATH: str = "../data/processed/grafo_3d.json"

    # Nodos agregados por el pipeline (MIN_GROUP_SIZE / top-N). No son entidades reales:
    # se excluyen de los rankings que se inyectan a la IA para evitar posiciones falsas.
    AGGREGATE_NODE_IDS: List[str] = ["comuna:otras-comunas", "colegio:otros-colegios"]
    
    # Gemini Convencional (Modo 1)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.1-flash-lite"
    GEMINI_FALLBACK_MODELS: List[str] = ["gemini-2.5-flash", "gemini-flash-latest"]
    GEMINI_TEMPERATURE: float = 0.1
    GEMINI_TIMEOUT_SECONDS: float = 6.0
    GEMINI_MAX_OUTPUT_TOKENS: int = 700
    GEMINI_VOICE_MAX_OUTPUT_TOKENS: int = 350
    COPILOT_MAX_PROMPT_CHARS: int = 500
    COPILOT_MAX_HISTORY_TURNS: int = 6
    COPILOT_RATE_LIMIT_PER_MINUTE: int = 30
    VOICE_MAX_TRANSCRIPT_CHARS: int = 350
    VOICE_CONVENTIONAL_RATE_LIMIT_PER_MINUTE: int = 30
    GRAPH_CACHE_MAX_AGE_SECONDS: int = 300

    # Gemini Multimodal Live API (Modo 2)
    GEMINI_LIVE_MODEL: str = "gemini-2.5-flash-native-audio-latest"
    GEMINI_LIVE_VOICE_NAME: str = "Puck"
    # Incluye tokens de audio (~25 tokens/s). Valores bajos cortan la voz a mitad de frase.
    GEMINI_LIVE_MAX_OUTPUT_TOKENS: int = 1024
    GEMINI_VOICE_LANGUAGE: str = "es-CO"
    VOICE_LIVE_MAX_CONCURRENT_SESSIONS: int = 3
    VOICE_LIVE_MAX_DURATION_SECONDS: int = 900  # 15 min por sesión
    VOICE_LIVE_INACTIVITY_TIMEOUT_SECONDS: int = 60
    VOICE_LIVE_MAX_RECONNECT_ATTEMPTS: int = 3

    model_config = SettingsConfigDict(env_file=[".env", "backend/.env"], extra="ignore")

settings = Settings()
