"""CLI entrypoint."""

import uvicorn

from voiceforge.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.app_env == "development",
    )


if __name__ == "__main__":
    main()
