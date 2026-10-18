from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "SIMA-3D API"
    VERSION: str = "1.0.0"
    
    # API & CORS
    API_V1_STR: str = "/api"
    CORS_ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]
    
    # Paths
    GRAPH_DATA_PATH: str = "../data/processed/grafo_3d.json"
    
    # Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_TEMPERATURE: float = 0.1
    COPILOT_MAX_PROMPT_CHARS: int = 500

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()