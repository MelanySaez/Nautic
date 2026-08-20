# PSCV-Lite — Nautic Module

Sistema de gestión de mantenimiento naval con inspección asistida por IA, desarrollado para COTECMAR.

Cubre dos dominios:

- **Rondas de mantenimiento** — registro de buques, equipos, parámetros y lecturas periódicas.
- **Inspección IA del casco** — el inspector fotografía secciones del casco y un modelo YOLO detecta anomalías (corrosión, defectos estructurales, incrustación marina, descascaramiento de pintura) de forma asíncrona.

## Estructura

| Directorio | Contenido |
|---|---|
| `frontend/` | SPA React 18 (Create React App + CRACO, JavaScript) |
| `api/` | App Django del dominio de mantenimiento |
| `vision/` | App Django del módulo de inspección IA |
| `backend/` | Configuración del proyecto Django (settings, Celery, wsgi/asgi) |
| `chatbot/` | Microservicio de IA conversacional (n8n + Qdrant + Ollama + translator, vía Docker Compose) |
| `scripts/` | Utilidades de carga y clasificación de documentación de equipos |
| `learn/` | Historias de usuario y material de referencia |

## Stack

Django 5.1 · Django REST Framework · PostgreSQL · Celery 5.4 · RabbitMQ · Redis · React 18 · YOLO (`nautic_core`)

Python 3.12.8.

## Puesta en marcha (desarrollo)

### 1. Backend

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env        # completa DB_PASSWORD y SECRET_KEY

python manage.py migrate
python manage.py seed_secciones_casco   # catálogo de secciones del casco
python manage.py runserver               # :8000
```

> `requirements.txt` instala `nautic_core` desde GitHub por SSH. Necesitas una clave SSH con acceso al repositorio.

### 2. Módulo de visión (solo si vas a usar la inspección IA)

Sin estos servicios las fotos se suben pero nunca se analizan.

```bash
sudo systemctl start rabbitmq-server redis
celery -A backend worker -Q vision -l info --concurrency=2 --pool=prefork

# opcional — monitoreo de workers en :5555
celery -A backend flower --port=5555 \
  --broker_api=http://guest:guest@localhost:15672/api/
```

### 3. Frontend

```bash
cd frontend
npm install
npm start                    # :3000
```

`frontend/src/config.js` define `API_BASE` (por defecto `http://localhost:8000`).

### 4. Chatbot (opcional)

```bash
cd chatbot
docker compose up -d
```

Ver [`chatbot/README.md`](chatbot/README.md) para variables de entorno y puertos.

## Documentación de API

Con el servidor Django corriendo:

- Swagger UI — http://localhost:8000/api/docs/
- ReDoc — http://localhost:8000/api/docs/redoc/
- Esquema OpenAPI 3 — http://localhost:8000/api/schema/

## Documentación técnica

| Documento | Alcance |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Convenciones de código, comandos y arquitectura general |
| [`vision/INSPECCION_IA.md`](vision/INSPECCION_IA.md) | Módulo de inspección IA de extremo a extremo + decisiones de diseño |
| [`VISION_BACKEND.md`](VISION_BACKEND.md) | Referencia del backend de visión (Celery, Redis, SSE, rate limiting) |
| [`VISION_FRONTEND.md`](VISION_FRONTEND.md) | Referencia del frontend de visión (componentes, SSE, estilos) |
| [`learn/Historias-de-Usuario.md`](learn/Historias-de-Usuario.md) | Historias de usuario y estado de implementación |

El dominio de mantenimiento (`api/`) aún no tiene documento propio.

## Notas

- **Sin autenticación.** Esta es la versión Lite: el middleware JWT está deshabilitado en `backend/settings.py` y no hay login. Los campos de autoría (p. ej. `tomado_por`) son texto libre.
- El idioma del dominio es español (modelos, rutas, variables de negocio); la interfaz soporta `es` y `en`.

## Licencia

MIT — ver [`LICENSE`](LICENSE).
