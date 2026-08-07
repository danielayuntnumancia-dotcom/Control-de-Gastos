# ESTADO DEL PROYECTO

## Logros de esta sesión
- **Navegación Interactiva desde Resumen Anual a Calendario:**
  - Habilitado el clic en las barras de la gráfica de *Evolución Mensual* para ir al calendario del mes seleccionado.
  - Clic funcional en las cabeceras de mes de la matriz anual (desktop) y en botones compactos "📅 Ver" en el acordeón móvil.
- **Corrección Estética en Gráficas (SVG):**
  - Eliminado el recuadro negro de foco (`outline`) que mostraba el navegador al hacer clic en los elementos gráficos de Recharts.
- **Sincronización Dinámica de Colores por Categoría:**
  - Corregida la asignación de color para que al cambiar de categoría (tanto en creación como edición de conceptos) se actualice dinámicamente el color asociado a la nueva categoría (ej: Verde Esmeralda para Seguros).
- **Internacionalización y Traducción de Estados al Español:**
  - Traducidas las claves internas de estado (`PENDING`, `PAID`, `PENDING_DATE`, etc.) a etiquetas en español (*Pendiente*, *Pagado*, *Fecha pendiente*, *Vencido*, etc.) en todos los desgloses anuales y listas.
- **Generación Retroactiva de Recibos y Botón de Sincronización:**
  - Permitida la modificación de la fecha de inicio de conceptos al pasado (ej: enero de este año).
  - Creado e implementado el motor y los botones **`🔄 Sincronizar recibos`** en la vista de *Conceptos* y en *Ajustes* para generar automáticamente todos los recibos pasados faltantes de forma masiva sin duplicar los existentes.
- **Permanencia de Gastos Pagados en su Mes Correspondiente:**
  - Corregido el bug donde marcar un recibo como pagado alteraba su `dueDate` a la fecha actual y lo desplazaba de su mes original.
  - Actualizado el filtrado del calendario (`CalendarMonthView` y `CalendarListView`) para clasificar por `originalPeriodMonth` y `originalPeriodYear`, asegurando que los gastos pagados se mantengan siempre visibles en el mes al que pertenecen.

- **Rediseño y Clasificación de la Matriz Anual:**
  - Separados los conceptos en secciones explícitas de **Ingresos** (badge/color verde) y **Gastos** (badge/color rojo).
  - Reestructurada la fila de totales del pie de la tabla:
    - *Totales Gastos (Previsto):* calcula únicamente los gastos estimados del mes.
    - *Totales Gastos (Real):* calcula la suma real de gastos del mes.
    - *Totales Ingresos (Real):* calcula la suma real de ingresos del mes.
    - *Balance Neto Real (I - G):* calcula la diferencia real entre ingresos y gastos (`Ingresos - Gastos`), destacando en verde (`+`) el superávit y en rojo los déficit.
  - Añadida interactividad para plegar y desplegar (colapsar/expandir) las secciones de Ingresos y Gastos de la Matriz Anual haciendo clic en sus cabeceras.
  - Desplegada la nueva versión en producción a Firebase Hosting (`control-de-gastos-7ef00.web.app`).

- **Creación Dinámica de Categorías Personalizadas con Color Automático:**
  - Añadido el botón **`+ Nueva`** junto al selector de categoría en el formulario de creación/edición de conceptos (`ConceptForm`).
  - Implementado un modal interactivo que asigna automáticamente un color armónico basado en el nombre de la categoría.
  - Corregido el bug de anidamiento de formularios HTML5 y optimizada la UI para respuestas instantáneas de 0 ms.
  - Persistencia de categorías personalizadas en la colección `categories` de Firestore y gestión en la pantalla de Ajustes.
  - Nuevas categorías por defecto añadidas: `Ahorro` (Azul 🔵), `Hipoteca` (Púrpura 🏠) y `Préstamo` (Rosa 💳).

- **Optimización de la Pantalla de Inicio (Dashboard):**
  - **Enfoque en el mes en curso:** Restringido el panel de Inicio exclusivamente al mes actual, eliminando la sección de avance del mes siguiente.
  - **Filtro exclusivo de Gastos:** La lista de *Próximos Gastos* ahora excluye ingresos (`type === 'income'`) para centrarse 100% en los recibos a pagar.
  - **Sumatorio y Visibilidad Completa:** Eliminada la restricción por días de aviso y el límite de elementos para mostrar el 100% de los gastos pendientes del mes actual.
  - **Corrección de Céntimos a Euros:** Corregido el cálculo del acumulado dividiendo entre 100 (`/ 100`) para reflejar los importes reales exactos en euros.

- **Prioridad Absoluta a Cuantías Modificadas (`actualAmount`):**
  - Implementada la función `getPaymentDisplayAmount()` para que al modificar la cuantía de un pago/ingreso se muestre como importe principal en negrita en todas las vistas de la aplicación (Dashboard, Calendario mensual, Calendario compacto, Modal diario y Detalle del pago).

- **Etiquetado Semántico de Ingresos vs. Gastos:**
  - Corregida la vista de *Detalle del Pago* para que un ingreso superior a lo esperado se identifique correctamente como **"Mayor ingreso"** (en verde) en lugar de "Sobrecoste".

## Tareas pendientes para la próxima
- Continuar monitoreando el uso del sistema y evaluar nuevas métricas o vistas personalizadas según el feedback.
