FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv==0.13.3
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev
COPY backend ./backend
COPY datasets ./datasets
CMD ["uv", "run", "--no-dev", "uvicorn", "agentguard.api:create_app", "--factory", "--app-dir", "backend/src", "--host", "0.0.0.0", "--port", "8000"]
