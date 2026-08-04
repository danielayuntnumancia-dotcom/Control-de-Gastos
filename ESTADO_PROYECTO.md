# ESTADO DEL PROYECTO

## Logros de esta sesión
- **Corrección de Bug Crítico (Resumen Anual):** Se solucionó la ruptura de la vista anual y los detalles de concepto al recalcular los totales netos.
- **Mejora UX en el Calendario:** Se fijó la cuadrícula del calendario a 42 celdas y el título del mes a un ancho mínimo, evitando molestos saltos visuales al cambiar de mes.
- **Corrección en Borrado de Conceptos:** Se solucionó el error de permisos (`Missing or insufficient permissions`) al intentar eliminar un concepto, asegurando que las peticiones a Firestore validan el ID de usuario.
- **Quick-Actions para Fechas Aproximadas:** Se añadieron botones rápidos en los pagos de fecha aproximada para que el usuario pueda seleccionar el día exacto de pago con un solo clic desde la pantalla de detalle.
- **Rediseño de la Visualización de Balances (Trilogía):**
  - El motor de pagos (`paymentUtils.ts`) ahora devuelve desgloses estructurados de Ingresos, Gastos y Balance Neto.
  - La cabecera del `CalendarMonthView` incluye un Dashboard claro con tres tarjetas separando entradas y salidas.
  - La cabecera de `AnnualView` muestra totales del año separados por ingresos y gastos.
  - La gráfica de evolución anual ahora dibuja dos columnas separadas (verde para ingresos, roja para gastos), permitiendo contrastar volúmenes reales.
  - El desglose móvil del resumen anual muestra ahora insignias detalladas.

## Tareas pendientes para la próxima
- **Importación Masiva (Excel / CSV):** Desarrollar la funcionalidad que permita subir un archivo externo con gastos e ingresos, mapear las columnas y generar los registros en Firestore a través de operaciones en Batch, incluyendo una vista previa para el usuario. (Consultar el archivo `plan_importacion_masiva.md` generado en la raíz para recuperar contexto).
