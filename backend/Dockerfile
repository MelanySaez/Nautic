# Build from the repository root:
#   DOCKER_BUILDKIT=1 docker build --ssh default -f backend/Dockerfile .
# The SSH mount is required because nautic_core is installed from a private Git repo.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# System dependencies (git + ssh to fetch nautic_core; postgresql-client for manage.py dbshell)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        openssh-client \
        postgresql-client \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p -m 0700 ~/.ssh \
    && ssh-keyscan github.com >> ~/.ssh/known_hosts

# Install Python dependencies from the lockfile (cached layer)
COPY pyproject.toml uv.lock ./
RUN --mount=type=ssh uv sync --frozen --no-dev

# Copy the project files
COPY . .

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
