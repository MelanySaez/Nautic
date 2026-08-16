# Combined Docker Compose Setup

This folder contains a combined Docker Compose setup that includes:

- **n8n**: Workflow automation platform
- **PostgreSQL**: Database for n8n
- **Qdrant**: Vector database for AI/ML applications
- **Ollama**: Local AI model serving

## Services and Ports

- **n8n**: http://localhost:5678
- **PostgreSQL**: localhost:5433 (external) → 5432 (internal)
- **Qdrant REST API**: http://localhost:6333
- **Qdrant gRPC API**: http://localhost:6334
- **Ollama**: http://localhost:7869

## Communication

All services can communicate using `localhost` addresses:
- **n8n → PostgreSQL**: `localhost:5433`
- **n8n → Qdrant**: `http://localhost:6333`
- **n8n → Ollama**: `http://localhost:7869`
- **External access**: All services are accessible via localhost from the host machine

## Environment Variables

Create a `.env` file in this directory with the following variables:

```env
# PostgreSQL Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_DB=n8n
POSTGRES_NON_ROOT_USER=n8n_user
POSTGRES_NON_ROOT_PASSWORD=your_n8n_password

# Qdrant Configuration
API_KEY_QDRANT=your_qdrant_api_key
```

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
- `Dockerfile`: Custom n8n image with Python dependencies
- `init-data.sh`: PostgreSQL initialization script
- `requirements.txt`: Python dependencies for n8n
- `data/`: Data directory mounted into n8n container
- `config/`: Qdrant configuration directory

## Networking

- All services use the default Docker bridge network
- Services communicate via `localhost` addresses
- PostgreSQL port (5432) is exposed for direct access
- All services are accessible from the host machine via localhost

## Volumes

- `db_storage`: PostgreSQL data persistence
- `n8n_storage`: n8n data persistence
- `qdrant_data`: Qdrant data persistence
- `ollama_data`: Ollama model storage
