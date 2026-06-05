
## Resumen

Voy a ampliar la app en 5 frentes. Para no romper nada, lo hago por etapas en este orden (apruébame el plan y arranco con el paso 1; el resto los sigo en cuanto termine cada uno).

## 1. Tarjetas: límite, corte, pago, disponible

- Agrego a la tabla `cards` los campos: `credit_limit`, `cut_day` (1–31), `payment_day` (1–31), `min_payment`, `no_interest_payment`.
- En **Tarjetas → editar/crear** aparecen los nuevos campos.
- En la vista de tarjeta calculo y muestro:
  - **Disponible** = `credit_limit − saldo actual del periodo`
  - **Próximo corte** y **próximo pago** (fechas reales, con badge si faltan ≤5 días o está vencido).
  - Pago mínimo y pago para no generar intereses (cuando estén capturados).

## 2. Desglose por persona

- Nueva ruta **/personas/$personId** con:
  - Total que debe, separado por tarjeta.
  - Por tarjeta: lista de compras asignadas, MSI con "pago X de Y", contado, y fecha límite de pago de esa tarjeta.
  - Totales por mes.
- En **/personas** cada persona ya muestra su total con link al detalle.

## 3. Compartir PDF

- Botón **"Descargar PDF"** en el detalle de persona.
- Genero el PDF en el servidor (server function con `pdf-lib`) con:
  - Encabezado (nombre, fecha)
  - Tabla por tarjeta: compras, monto, MSI restantes, fecha de pago
  - Totales y "qué pagar para no generar intereses"
- Se descarga directo desde el navegador, listo para mandar por WhatsApp.

## 4. Recordatorios por WhatsApp (Twilio)

- Conecto el conector de **Twilio** (te voy a pedir autorizar la conexión).
- Agrego a `people` el campo `phone` (ya existe) y a `cards` un toggle `reminders_enabled`.
- Cron job diario (`pg_cron`) que a las 9:00 AM revisa tarjetas con pago en ≤3 días y manda WhatsApp al dueño (y opcional a cada persona con su monto).
- Importante: Twilio requiere número de WhatsApp Business aprobado o el sandbox de Twilio para pruebas. Te aviso los pasos exactos al conectar.

## 5. Parser de PDFs: reforzar al 100%

Aquí necesito tu ayuda porque cada banco tiene formato distinto. El parser actual usa regex genéricos y por eso a veces se salta líneas.

**Mi plan:**
- Migrar a un parser híbrido: primero intento regex específicos por banco (AmEx, BBVA, Santander, Banamex, HSBC, Banorte) detectando el banco por el encabezado del PDF.
- Si quedan líneas no clasificadas, las paso al modelo de **Lovable AI** (Gemini) con el texto crudo para que extraiga las compras restantes en JSON estructurado. Eso eleva la tasa cerca de 100%.
- Muestro en la pantalla de subida un resumen: "X compras detectadas por regex, Y por IA, Z líneas ignoradas (con preview)".

**Para hacerlo bien necesito que me subas los PDFs que están fallando** (los que dicen "no se detectaron compras" o se saltan líneas). Sin el formato real no puedo afinar los regex.

## Detalle técnico

- Migración SQL para `cards` (nuevas columnas) y `people.phone` ya existe.
- `src/lib/share-pdf.functions.ts` con `createServerFn` que arma el PDF usando `pdf-lib` (ya soportado en Workers).
- `src/lib/reminders.server.ts` + ruta `/api/public/hooks/payment-reminders` llamada por `pg_cron` que usa el connector gateway de Twilio.
- Parser: refactor de `src/lib/pdf-parser.server.ts` en módulos por banco + fallback IA con `LOVABLE_API_KEY`.

## Orden de entrega

1. Tarjetas (límite/corte/pago + UI de disponible) — chico, lo hago ya.
2. Desglose por persona + PDF compartible — mediano.
3. Refuerzo del parser (necesito tus PDFs).
4. Recordatorios WhatsApp (necesito que conectes Twilio).

¿Apruebas y arranco con el paso 1? Y de una vez, **súbeme los PDFs que están fallando** para tenerlos listos cuando lleguemos al paso 3.
