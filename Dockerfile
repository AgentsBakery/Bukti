# Stage 1: build the web app
FROM node:24-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# Stage 2: API + agents
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy BUKTI_CACHE_DIR=/tmp/bukti
COPY --from=ghcr.io/astral-sh/uv:0.12.8 /uv /bin/uv
WORKDIR /srv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app ./app
COPY agents ./agents
COPY data ./data
COPY --from=web /web/dist ./web/dist
RUN useradd --create-home --uid 10001 bukti && chown -R bukti /srv
USER bukti
EXPOSE 8080
CMD ["/srv/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
