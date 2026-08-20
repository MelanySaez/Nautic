# Combined Docker Compose Setup

This folder contains a combined Docker Compose setup that includes:

- **n8n**: Workflow automation platform (custom image, see `Dockerfile`)
- **PostgreSQL**: Database for n8n
- **db-bootstrap**: One-shot job that creates the non-root n8n role and grants (idempotent)
- **Qdrant**: Vector database for AI/ML applications
- **Ollama**: Local AI model serving
- **translator**: Python service built from `./api` (`traslator.py`)

## Services and Ports (from the host)

| Service | Host URL | Container port |
|---|---|---|
| n8n | http://localhost:5678 | 5678 |
| PostgreSQL | localhost:5433 | 5432 |
| Qdrant REST API | http://localhost:6333 | 6333 |
| Qdrant gRPC API | http://localhost:6334 | 6334 |
| Ollama | http://localhost:7869 | 11434 |
| translator | http://localhost:8001 | 8001 |

`db-bootstrap` exposes no port — it runs, does its work, and exits. `n8n` waits for it with `condition: service_completed_successfully`.

## Communication

Two distinct address spaces — do not mix them up:

**Between containers** — use the Compose **service name** and the **internal** port. Docker's embedded DNS resolves service names on the project network; `localhost` inside a container refers to that container itself, not the host.

- n8n → PostgreSQL: `postgres:5432` (this is what `DB_POSTGRESDB_HOST`/`DB_POSTGRESDB_PORT` are set to)
- n8n → Qdrant: `http://qdrant:6333`
- n8n → Ollama: `http://ollama:11434`
- translator → PostgreSQL: `postgres:5432`
- translator → Qdrant: `http://qdrant:6333`

**From the host** (browser, Django, curl) — use `localhost` and the **published** port from the table above. This is where `5433` and `7869` apply.

## Environment Variables

Create a `.env` file in this directory. The services read it via `env_file`:

```env
# PostgreSQL Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DB=n8n
POSTGRES_NON_ROOT_USER=n8n_user
POSTGRES_NON_ROOT_PASSWORD=your_n8n_password

# Qdrant Configuration
API_KEY_QDRANT=your_qdrant_api_key

# n8n
N8N_ENCRYPTION_KEY=your_n8n_encryption_key
```

Optional (each has a default in `docker-compose.yml`):

| Variable | Default |
|---|---|
| `GENERIC_TIMEZONE` | `America/Bogota` |
| `N8N_DIAGNOSTICS_ENABLED` | `false` |
| `N8N_VERSION_NOTIFICATIONS_ENABLED` | `false` |
| `N8N_PERSONALIZATION_ENABLED` | `false` |

## Usage

1. Create your `.env` file with the environment variables above
2. Run the services:
   ```bash
   docker-compose up -d
   ```

3. To stop the services:
   ```bash
   docker-compose down
   ```

4. To rebuild the n8n service (if you modify the Dockerfile):
   ```bash
   docker-compose up --build n8n
   ```

## File Structure

- `docker-compose.yml`: Combined configuration for all services
- `docker-compose copy.yml`, `docker-compose copy 2.yml`: Older variants kept as reference — not used by `docker compose up`
- `Dockerfile`: Custom n8n image with Python dependencies
- `init-data.sh`: PostgreSQL initialization script
- `requirements.txt`: Python dependencies for n8n
- `api/`: Source of the `translator` service (`traslator.py`, its own `Dockerfile` and `requirements.txt`)
- `data/`: Data directory mounted into the n8n container at `/home/node`
- `config/`: Mounted into Qdrant at `/qdrant/config`. Not tracked in the repo — Docker creates it empty on first run

## Networking

- Compose creates its own project network; every service joins it and is reachable by its service name
- Container-to-container traffic uses service names and internal ports (`postgres:5432`, `qdrant:6333`, `ollama:11434`)
- PostgreSQL is published to the host as `5433` → container `5432`, to avoid clashing with a local Postgres install
- Ollama is published as `7869` → container `11434`

## Volumes

- `db_storage`: PostgreSQL data persistence
- `n8n_storage`: n8n data persistence
- `qdrant_data`: Qdrant data persistence
- `ollama_data`: Ollama model storage
