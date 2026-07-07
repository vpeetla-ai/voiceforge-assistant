.PHONY: install test lint serve ui-dev ui-build

install:
	pip install -e ".[dev,tts,api]"

test:
	pytest -q

lint:
	ruff check voiceforge api tests

serve:
	uvicorn api.main:app --reload --port 8000

ui-dev:
	cd ui && npm install && npm run dev

ui-build:
	cd ui && npm install && npm run build
