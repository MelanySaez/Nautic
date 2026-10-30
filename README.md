# Nautic

Backend de inspección de cascos de buques con análisis visual asistido por IA (YOLO). El inspector fotografía secciones del casco y un modelo detecta anomalías (corrosión, defectos estructurales, incrustación marina, descascaramiento de pintura) de forma asíncrona, con progreso en tiempo real por SSE.

> **Estado:** backend en `backend/` y frontend React + TypeScript en `frontend/` (ver [`frontend/README.md`](frontend/README.md)).

## Idea base (hoja de ruta)

El producto se organiza en tres secciones. Hoy están implementadas Visión IA, Inspecciones y, parcialmente, Buques (alta, listado y detalle).

| Sección | Qué es | Estado |
|---|---|---|
| **Buques** | Entidad buque con ficha técnica (dimensiones, autonomía, capacidades, etc.) | Modelo `Buque` + endpoints `GET/POST /api/buques/` y `GET /api/buques/<id>/` (crear, listar con `offset`/`limit`, ficha completa); **sin edición ni borrado** |
| **Inspecciones** | Sesiones de inspección por buque | Modelo y endpoints en `vision` |
| **Visión IA** | Análisis YOLO del casco; todo análisis pertenece a una inspección concreta | Implementado |

Los buques se crean con `POST /api/buques/` (`nombre` y `tipo` son obligatorios; el resto de la ficha técnica es opcional). Editar o eliminar un buque aún no tiene endpoint: `Buque` no está registrado en el admin.

## Estructura

| Ruta | Contenido |
|---|---|
| `backend/` | Todo el código Python/Django |
| `backend/config/` | Configuración del proyecto Django (settings, urls, Celery, wsgi/asgi) |
| `backend/vision/` | Única app Django: modelos, API REST, SSE, tareas Celery |
| `backend/pyproject.toml`, `backend/uv.lock` | Dependencias (uv) |
| `frontend/` | Frontend React + TypeScript (Vite). `frontend/interfaz/` guarda los mockups de referencia |

## Puesta en marcha

**Requisitos:** Python 3.12, [uv](https://docs.astral.sh/uv/), PostgreSQL, RabbitMQ, Redis, acceso SSH a `AaronDLF/nautic_core` (se instala por Git) y los pesos del modelo en disco.

```bash
cd backend
cp .env.example .env     # completa DB_PASSWORD, SECRET_KEY y NAUTIC_WEIGHTS_DIR
uv sync                  # instala dependencias (incluye nautic_core v3.0.0)

createdb NauticDB        # o crea la base desde psql
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

### Configuración del modelo

| Variable | Descripción |
|---|---|
| `NAUTIC_WEIGHTS_DIR` | **Obligatoria.** Directorio con los pesos (p. ej. `yolo11s-seg-0.1.0.pt`) |
| `VISION_MODEL_ID` | Modelo a usar: `yolo-seg` (default), `yolo-tiled`, `maskrcnn`, `rtdetr` |

Si alguna es inválida, `manage.py check` falla (`vision.E001`) y el worker de Celery se niega a arrancar.

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

## Notas

- **Sin autenticación** en esta versión. Los campos de autoría (p. ej. `tomado_por`) son texto libre.
- El idioma del dominio es español (modelos, rutas, variables de negocio).
- **Fotos de inspección:** se guardan en disco local en desarrollo y en un bucket S3-compatible (URL firmadas que expiran) en producción; se elige con `STORAGE_BACKEND` (ver [`backend/.env.example`](backend/.env.example)).

## Licencia

MIT — ver [`LICENSE`](LICENSE).
