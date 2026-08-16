# Historias de Usuario - Proyecto COTECMAR

## Información del Proyecto

**Proyecto:** Sistema de Detección de Anomalías en Cascos de Buques  
**Cliente:** COTECMAR  
**Fecha de última actualización:** 3 de febrero de 2026

---

## Actor Principal

- **Usuario del Sistema**: Personal técnico de COTECMAR responsable de inspecciones, análisis y mantenimiento de embarcaciones. Tiene acceso completo a todas las funcionalidades del sistema.

---

## Historias de Usuario

### HU-01: Registrar Barco en el Sistema

**Como** usuario del sistema  
**Quiero** registrar un nuevo barco con su información básica  
**Para** poder asociar inspecciones y llevar trazabilidad del estado de cada embarcación

**Criterios de Aceptación:**

- El sistema permite ingresar información básica del barco (nombre, matrícula, tipo, etc.)
- El sistema valida que no exista duplicidad en la identificación del barco
- El barco queda registrado y disponible para asociar inspecciones

> ⚠️ **DECISIÓN PENDIENTE (Cap. 03-Feb-2026)**: Confirmar si el registro del barco debe ser completo de una vez o puede ser editado/completado posteriormente (mismo usuario u otros usuarios)

---

### HU-02: Registrar Componente o Estructura Naval

**Como** usuario del sistema  
**Quiero** registrar componentes o estructuras específicas de un barco  
**Para** organizar las inspecciones por secciones y mantener un registro detallado

**Criterios de Aceptación:**

- El sistema permite asociar componentes a un barco específico
- Cada componente tiene identificación única dentro del barco
- Los componentes quedan disponibles para ser inspeccionados

---

### HU-03: Realizar Inspección con Imagen

**Como** usuario del sistema  
**Quiero** cargar una imagen de un componente o estructura naval  
**Para** que el sistema detecte automáticamente daños y anomalías

**Criterios de Aceptación:**

- El sistema permite seleccionar el barco y componente a inspeccionar
- El usuario puede cargar una imagen (formatos: JPG, PNG)
- El sistema registra fecha, hora y usuario que realizó la inspección
- La inspección queda en estado "pendiente" o "en proceso"
- El sistema acepta la imagen y comienza el procesamiento automático

---

### HU-04: Recibir Notificación de Análisis Completado

**Como** usuario del sistema  
**Quiero** recibir una notificación cuando el análisis de una imagen haya finalizado  
**Para** revisar los resultados sin tener que estar consultando constantemente el estado

**Criterios de Aceptación:**

- El sistema envía notificación en tiempo real al completar el análisis
- La notificación indica qué inspección se completó
- El usuario puede acceder directamente a los resultados desde la notificación

---

### HU-05: Visualizar Resultados de Inspección

**Como** usuario del sistema  
**Quiero** ver los resultados del análisis de una inspección  
**Para** conocer el estado del componente y las anomalías detectadas

**Criterios de Aceptación:**

- El sistema muestra la imagen original cargada
- El sistema muestra la imagen procesada con anotaciones de las áreas afectadas
- Se visualiza el diagnóstico con:
  - Tipo de daño detectado (corrosión, grietas, deformaciones, desgaste)
  - Severidad del daño (porcentaje de área afectada)
  - Ubicación precisa del daño
  - Nivel de criticidad
- Se muestra el pronóstico de mantenimiento según tipo de daño:
  - Para daños progresivos: vida útil restante (RUL)
  - Para daños críticos: recomendación de acción inmediata
- La información es clara y comprensible para personal sin conocimientos técnicos avanzados en IA

---

### HU-06: Consultar Historial de Inspecciones

**Como** usuario del sistema  
**Quiero** consultar el historial de inspecciones realizadas  
**Para** hacer seguimiento del estado de un barco o componente a lo largo del tiempo

**Criterios de Aceptación:**

- El sistema permite filtrar inspecciones por:
  - Barco específico
  - Componente específico
  - Rango de fechas
  - Usuario que realizó la inspección
  - Estado de la inspección
- Se puede visualizar el detalle de cualquier inspección histórica
- El historial muestra tendencias de deterioro visibles

---

### HU-07: Generar Reporte Técnico

**Como** usuario del sistema  
**Quiero** generar un reporte técnico de una o varias inspecciones  
**Para** documentar el estado del barco y presentar recomendaciones de mantenimiento

**Criterios de Aceptación:**

- El sistema permite seleccionar una o múltiples inspecciones
- El reporte incluye:
  - Diagnóstico del estado actual
  - Pronóstico de mantenimiento con estimaciones de tiempo
  - Recomendaciones de acción
  - Imágenes anotadas con áreas afectadas
- El reporte puede exportarse en formato PDF
- Las imágenes procesadas pueden exportarse individualmente

---

### HU-08: Reintentar Análisis Fallido

**Como** usuario del sistema  
**Quiero** poder reintentar el análisis de una imagen que falló durante el procesamiento  
**Para** obtener resultados sin tener que crear una nueva inspección desde cero

**Criterios de Aceptación:**

- El sistema identifica claramente las inspecciones con errores de procesamiento
- El usuario puede solicitar un reintento del análisis
- El sistema conserva la información original de la inspección
- Si el reintento falla nuevamente, se muestra información del error

---

### HU-09: Consultar Estado de Inspección

**Como** usuario del sistema  
**Quiero** consultar el estado actual de una inspección  
**Para** saber si está pendiente, en proceso o completada

**Criterios de Aceptación:**

- El sistema muestra claramente el estado de cada inspección:
  - Pendiente: en cola para procesamiento
  - En proceso: siendo analizada por el modelo ML
  - Completada: resultados disponibles
  - Error: falló el procesamiento
- Se muestra el tiempo estimado o transcurrido según corresponda

---

## Notas Técnicas

### Cambios Respecto a Versiones Anteriores

- **Eliminado**: Rol de "superusuario" según indicación del capitán (03-Feb-2026)
- **Simplificado**: Un solo tipo de usuario con permisos completos

### Decisiones Pendientes

1. **Gestión de barcos**: ¿Registro atómico o permite edición incremental? ¿Por cualquier usuario?
2. **Autenticación**: ¿Sistema de credenciales individual o compartido?
3. **Permisos entre usuarios**: ¿Un usuario puede ver/editar inspecciones de otros?

---

## Trazabilidad

Estas historias de usuario son la base para:

- ✅ **Requerimientos.md** - Especificaciones técnicas derivadas
- ✅ **Casos-de-Uso.md** - Flujos detallados de interacción
- ✅ **02-Arquitectura/** - Decisiones de diseño del sistema
- ✅ **03-Diseño-UI-UX/** - Mockups y flujos de interfaz
