# Feature: imagen-buque
Objective: the vessel form's "Imagen" opens the file explorer to pick an image, which is uploaded and stored instead of typed as text.
Branch: `feat/imagen-buque` (from `main`; independent of the 3D branches). Runners: Django `manage.py test`, Vitest.

## Specs
- **S1** — The user said: "en la parte de imagen al crear un buque deja colocar una cadena texto, la intencion es que abra el explorador para seleccionar la imagen de preferencia por el usuario".
  - The create and edit forms show a file picker (`accept="image/*"`) with a preview of the chosen image.
  - In edit, the user can replace or remove the image.
- **S2** — Backend upload: `POST /api/buques/<id>/imagen/` (multipart `imagen`) and `DELETE` on the same path.
  - **Validation:** the file must be a real image (the same check as inspection photos: extension, content type, PIL), and at most 5 MB.
  - **Storage:** the file is stored through the photo storage helpers, under `buques/imagenes/`. Replacing the image deletes the previous file.
  - **Errors:** an invalid file returns 400 `campos.imagen`.
- **S3** — Security: the JSON POST/PATCH no longer accept `imagen` as text, because a client could point it at another inspection's photo key.
  - Responses expose `imagen` as the stored image URL (`url_archivo`), or null.
  - Legacy free-text values are shown as null.
- **S4** — Creation flow: the form creates the vessel, then uploads the image.
  - If the upload fails, the vessel stays created.
  - The sheet opens with a visible error message saying the image was not saved.

## Tasks
- [x] T1 — S2, S3 backend: endpoint, storage helper, image validation shared with photos, `imagen` read-only and served as a URL, tests, docs. Route: inline.
- [x] T2 — S1, S4 frontend: repository `subirImagen`/`quitarImagen`, file picker with preview in `CamposBuque`, the create and edit flows, tests, docs. Route: inline.

Risk: item 2 (file upload and URL exposure) and item 3 (`imagen` stops being writable through JSON). Both get an independent verifier at the end.

## Log
- L1 (2026-11-18): "en la parte de imagen al crear un buque deja colocar una cadena texto, la intencion es que abra el explorador para seleccionar la imagen de preferencia por el usuario"
- L2: T1 GREEN.
  - Added `vision/imagenes.py`: `validar_imagen`, moved out of `views.py` and reused for photo uploads.
  - Added `almacenamiento.guardar_imagen_buque` / `es_imagen_buque`, and the `api_buque_imagen` endpoint (POST/DELETE).
  - `imagen` is now read-only in JSON and served as a URL.
  - Evidence: RED first (12 failures, 1 error). Now `test_imagen_buque`, `test_buques_api` and every test that uploads files pass, and `manage.py check` is clean.
- L3: T2 GREEN.
  - **What changed:**
    - `CampoImagen` (file picker plus preview) and `eleccionImagen.ts`.
    - Repository `subirImagen`/`quitarImagen`.
    - The create flow uploads after creating, with a sheet notice when the upload fails.
    - The edit flow runs the PATCH, then the image operation, and shows image errors under the field.
    - The sheet shows the image.
    - Test setup fakes `URL.createObjectURL`.
  - **Evidence:**
    - RED first: 2 repository tests and 11 page tests failed.
    - All 52 `buques` tests pass, plus the shared tests.
    - tsc, lint and build are clean.
- L4 (2026-11-18): the native review (risk, readability, reliability) of `main..c7e4179` was approved and acknowledged. The risk lens found nothing.
  - **Fixed:**
    - A client-rejected file blocked creating without an image, and blocked retrying in edit after a server failure (R3-001, R3-002). Now `useEleccionImagen` is shared and the error is not carried into submit.
    - The preview broke under StrictMode (R3-004). Now an effect owns the URL.
    - Concurrent or failed uploads orphaned files (R3-003). Now `select_for_update` is used, and the new file is deleted on failure.
    - The size messages are derived from the limit.
    - The misleading retry comment is fixed.
    - The misplaced AGENTS note is fixed.
  - **Evidence:** RED first (backend 2, frontend 3). Now `test_imagen_buque` and `test_buques_api` pass, 54 `buques` tests pass, and tsc, lint and build are clean.
