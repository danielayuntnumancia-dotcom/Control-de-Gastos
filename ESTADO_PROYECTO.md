# Estado del Proyecto: Control de Gastos

**Última actualización:** 7 de Septiembre de 2026

## Logros de la Sesión
- **Concepto "Traspaso / Ahorro" con Cuenta de Origen y Cuenta de Destino:**
  - Soporte nativo para conceptos de traspaso de fondos (ej. dinero que sale de *Unicaja* y entra en *Trade Republic*).
  - Tipado actualizado en `src/types.ts` (`type: 'transfer'` y `destinationAccountId`).
  - Formulario de conceptos (`ConceptForm.tsx`) con 3 pestañas: *Gasto*, *Ingreso* y *Traspaso / Ahorro*, con selectores duales validados para evitar seleccionar la misma cuenta en origen y destino.
  - Insignia visual del flujo `[Cuenta Origen] ➔ [Cuenta Destino]` con icono `sync_alt` en `ConceptsView.tsx`, `ConceptDetailsView.tsx`, `CalendarListView.tsx` y `CalendarMonthView.tsx`.
  - En `DashboardView.tsx`: los traspasos computan como salida pendiente/prevista de la cuenta de origen para planificar el saldo bancario necesario, manteniendo neutralidad en el balance global.
  - En `PaymentDetailsPanel.tsx`: soporte para visualizar y editar la cuenta de origen y de destino de los pagos de traspaso.
  - En `AnnualView.tsx`: sección dedicada e independiente de *Traspasos / Ahorro* con su matriz mensual y totales.
  - En `paymentGenerator.ts` y `paymentUtils.ts`: generación y sincronización automática de recibos con ambas cuentas asociadas.
- **Corrección de Guardado en Firestore (`undefined`):**
  - Se eliminaron valores `undefined` en `destinationAccountId` y `accountId`, reemplazándolos por `null` para cumplir con las especificaciones de Cloud Firestore.
- **Orden Alfabético en Categorías:**
  - Ordenamiento alfabético estricto (A-Z con `localeCompare` en español) en el selector de categorías de `ConceptForm.tsx`, integrando automáticamente tanto las categorías predeterminadas como cualquier categoría personalizada nueva.
  - Ordenamiento alfabético también aplicado en los desplegables de filtro de `ConceptsView.tsx` y `MonthlyView.tsx`.
- **Corrección de Reglas de Seguridad en Cloud Firestore:**
  - Se actualizó [firestore.rules](file:///e:/01%20-%20GitHub/Control-de-Gastos-main/firestore.rules) para validar y permitir el campo `destinationAccountId` en `isValidConcept` e `isValidPayment`.
  - Se implementó `serverTimestamp()` de Firebase en `ConceptForm.tsx` para cumplir con la verificación `createdAt == request.time` del servidor.
- **Despliegue y Sincronización:**
  - Compilación limpia de producción con Vite/TypeScript (`npm run build`).
  - Despliegue de Hosting y reglas de seguridad en Firebase (`control-de-gastos-7ef00.web.app`).
  - Repositorio sincronizado en GitHub en la rama `main`.

## Tareas Pendientes para la Próxima Sesión
- Monitorizar el comportamiento del concepto **Ahorro** configurado como traspaso entre *Unicaja* y *Trade Republic*.
- Probar la compilación final del APK en Android Studio con las nuevas funciones implementadas.
- Evaluar posibles mejoras de visualización en pantallas móviles reducidas para los badges de flujo entre cuentas.
