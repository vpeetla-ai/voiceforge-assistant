from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    cors_origins: str = "http://localhost:3000,https://voiceforge-assistant.vercel.app"

    # Pipeline modes: browser_asr | server_whisper | mock
    asr_mode: str = "browser_asr"
    llm_mode: str = "mock"  # mock | ollama | domainforge
    tts_mode: str = "edge"  # edge | browser | mock

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "mistral"
    domainforge_api_url: str = "https://domainforge-api.onrender.com"

    whisper_model: str = "tiny"
    edge_tts_voice: str = "en-US-AriaNeural"

    asr_timeout_ms: int = 8000
    llm_timeout_ms: int = 15000
    tts_timeout_ms: int = 10000
    total_timeout_ms: int = 30000

    replay_store_path: Path = Path("data/replays/latest.json")


def get_settings() -> Settings:
    return Settings()
