# Nautic

Sistema de inspección de cascos de buques con análisis visual asistido por IA. El inspector fotografía secciones del casco y un modelo de visión detecta anomalías (corrosión, defectos estructurales, incrustación marina, descascaramiento de pintura) de forma asíncrona, con el progreso en tiempo real por SSE.

Este repositorio es un **monorepo**: backend Django en `backend/` y frontend React + TypeScript en `frontend/`.

## Enfoque actual

El proyecto se organiza en tres secciones y avanza **backend primero**: cada sección se cierra en la API, con tests, antes de construir su interfaz sobre un contrato ya verificado.

| Sección | Qué es | Backend | Frontend |
|---|---|---|---|
| **Buques** | Entidad buque con ficha técnica (dimensiones, autonomía, capacidades…) | Alta, listado y ficha | Pendiente (hoy usa datos de ejemplo) |
| **Inspecciones** | Sesiones de inspección por buque | Alta, listado, detalle y borrado | Alta, listado y detalle |
| **Visión IA** | Análisis del casco; todo análisis pertenece a una inspección | Fotos → cola Celery → inferencia → resultados en vivo (SSE) | Carga de fotos por zona y resultados en vivo |

### Hoja de ruta

- **Búsqueda de inspecciones** combinable (buque, fechas, severidad, nombre) en la API y en la interfaz.
- **Interfaz de Buques** sobre la API existente.
- **Búsqueda en lenguaje natural** que traduzca la consulta a esos mismos filtros.
- **Preparación para despliegue**: fotos en un almacenamiento de objetos (bucket) en lugar del disco del servidor.

El detalle de cada feature (alcance, decisiones, estado y traspasos pendientes) está en [`odd/tasks/`](odd/tasks/); el trabajo en curso, en las pull requests.

## Estructura

| Ruta | Contenido |
|---|---|
| `backend/config/` | Configuración del proyecto Django (settings, urls, Celery, wsgi/asgi) |
| `backend/vision/` | Única app Django: modelos, API REST (inspecciones y buques), SSE, tareas Celery, tests |
| `backend/pyproject.toml`, `backend/uv.lock` | Dependencias del backend (uv) |
| `frontend/` | SPA React + TypeScript (Vite, Tailwind v4, pnpm). `frontend/interfaz/` guarda los mockups de referencia |
| `odd/tasks/` | Documentos de cada feature: alcance, decisiones, evidencia y traspasos pendientes |

## Puesta en marcha

### Requisitos

- Python 3.12 y [uv](https://docs.astral.sh/uv/)
- PostgreSQL con la extensión `pg_trgm` (en Fedora: paquete `postgresql-contrib`; en Windows viene con el instalador oficial)
- RabbitMQ y Redis (solo para que las fotos se analicen)
- Node 20.19+ o 22.12+ y pnpm 12 (frontend)
- Acceso SSH al repositorio privado `AaronDLF/nautic_core` (se instala por Git) y a sus pesos

### 1. Pesos del modelo

Los pesos no se distribuyen por Git: están publicados en la release `weights-v1.0.0` de `nautic_core`.

```bash
gh release download weights-v1.0.0 -R AaronDLF/nautic_core -D ~/nautic-weights
(cd ~/nautic-weights && sha256sum -c SHA256SUMS)
tar xzf ~/nautic-weights/rtdetr-0.1.0.tar.gz -C ~/nautic-weights && rm ~/nautic-weights/rtdetr-0.1.0.tar.gz
```

Para usar solo el modelo por defecto basta `-p "yolo11s-seg-0.1.0.pt"`. Si solo vas a trabajar en buques o en el frontend, `NAUTIC_WEIGHTS_DIR` puede apuntar a una carpeta vacía: el arranque solo comprueba que exista; la inferencia sí necesita los pesos.

### 2. Backend

```bash
cd backend
cp .env.example .env     # completa DB_PASSWORD, SECRET_KEY y NAUTIC_WEIGHTS_DIR
uv sync                  # instala dependencias (incluye nautic_core v3.0.0)

createdb NauticDB        # o: psql -U postgres -c 'CREATE DATABASE "NauticDB";'
uv run python manage.py migrate
uv run python manage.py seed_secciones_casco   # catálogo de secciones del casco
uv run python manage.py runserver              # :8000
```

En otra terminal, para que las fotos se analicen:

```bash
sudo systemctl start rabbitmq-server redis
cd backend
uv run celery -A config worker -Q vision -l info --concurrency=2 --pool=prefork
```

Sin RabbitMQ, Redis y el worker las fotos se suben pero nunca se analizan.

### 3. Frontend

```bash
cd frontend
pnpm install
pnpm dev                 # http://localhost:5173 (reenvía /api y /media a :8000)
```

Detalles en [`frontend/README.md`](frontend/README.md).

### Configuración del modelo

| Variable | Descripción |
|---|---|
| `NAUTIC_WEIGHTS_DIR` | **Obligatoria.** Directorio local con los pesos (no admite URLs) |
| `VISION_MODEL_ID` | Modelo a usar: `yolo-seg` (default), `yolo-tiled`, `maskrcnn`, `rtdetr`. La app usa un modelo a la vez |

Si alguna es inválida, `manage.py check` (y por tanto `migrate` y `runserver`) falla con `vision.E001` y el worker de Celery se niega a arrancar.

## Tests

```bash
cd backend && uv run python manage.py test vision --noinput
cd frontend && pnpm test && pnpm lint && pnpm build
```

Los tests del backend crean una base temporal en PostgreSQL.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `uv sync` falla con `Permission denied (publickey)` en Windows | Git para Windows usa su propio SSH y no ve la clave del agente. Activa el servicio `ssh-agent`, carga la clave con `ssh-add` y ejecuta `git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"` |
| `uv sync` falla con `Repository not found` | La cuenta no tiene acceso a `AaronDLF/nautic_core`; pide que te agreguen como colaborador |
| Timeouts descargando paquetes | Red lenta: `UV_HTTP_TIMEOUT=300` y repite `uv sync` |
| `migrate` falla con `vision.E001` | `NAUTIC_WEIGHTS_DIR` no existe o sigue con el valor de ejemplo. Se edita `backend/.env`, no `.env.example` |
| `UnicodeDecodeError ... byte 0xab` al conectar | PostgreSQL en español devolvió un error que psycopg no pudo decodificar: casi siempre contraseña incorrecta o base inexistente. Pruébalo con `psql -U postgres -h localhost -d NauticDB` |
| La base se creó como `nauticdb` | En PowerShell 5.1 las comillas dobles se pierden al llamar a `psql`. Renómbrala desde dentro de `psql`: `ALTER DATABASE nauticdb RENAME TO "NauticDB";` |
| `extension "pg_trgm" is not available` | Falta el paquete de extensiones de PostgreSQL (`postgresql-contrib`); instálalo y reinicia el servicio |
| Los tests fallan con `collation version mismatch` | Tras actualizar glibc: `ALTER DATABASE template1 REFRESH COLLATION VERSION;` (y lo mismo para `postgres`) |

## Documentación de API

Con el servidor corriendo:

- Swagger UI — http://localhost:8000/api/docs/
- ReDoc — http://localhost:8000/api/docs/redoc/
- Esquema OpenAPI 3 — http://localhost:8000/api/schema/

## Documentación técnica

| Documento | Alcance |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Convenciones de código, comandos y arquitectura |
| [`backend/vision/INSPECCION_IA.md`](backend/vision/INSPECCION_IA.md) | Módulo de inspección IA de extremo a extremo + decisiones de diseño |
| [`VISION_BACKEND.md`](VISION_BACKEND.md) | Referencia del backend de visión (Celery, Redis, SSE, rate limiting, inferencia) |
| [`odd/tasks/`](odd/tasks/) | Registro de cada feature y documentos de traspaso para el frontend |

## Notas

- **Sin autenticación** en esta versión. Los campos de autoría (p. ej. `tomado_por`) son texto libre.
- El idioma del dominio es español (modelos, rutas, variables de negocio).
- Las fotos se guardan hoy en el disco del servidor (`backend/media/`): válido para desarrollo, no para un despliegue en contenedores (ver "Hoja de ruta").

## Licencia

MIT — ver [`LICENSE`](LICENSE).
