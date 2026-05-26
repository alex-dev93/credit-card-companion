
# App de Control de Tarjetas Prestadas

App web (en español) donde subes el PDF del estado de cuenta de tus tarjetas y la app extrae cada compra, te pregunta a quién pertenece, recuerda las recurrentes (MSI) y mes con mes te dice exactamente cuánto te debe pagar cada persona.

## Funcionalidades principales

1. **Login con email/contraseña + Google** (Lovable Cloud).
2. **Gestión de tarjetas**: alta de varias tarjetas (banco, alias, últimos 4 dígitos, color).
3. **Gestión de personas**: contactos a quienes les prestas la tarjeta (nombre, teléfono opcional).
4. **Subida de estado de cuenta (PDF)**:
   - Seleccionas la tarjeta y el mes.
   - La app guarda el PDF y extrae las compras (fecha, comercio, monto, total de mensualidades si es MSI, número de mensualidad actual).
5. **Asignación de compras**:
   - Compra nueva → modal "¿De quién es esta compra?" con lista de personas + opción "agregar nueva" + opción "dividir entre varios" (selección múltiple con monto/proporción).
   - Compra recurrente (mismo comercio + mismo monto MSI ya visto el mes pasado) → se asigna **automáticamente** a la misma persona; te muestra un resumen "Detectadas X recurrentes asignadas automáticamente" con opción de revisar.
6. **Desglose mensual por tarjeta**:
   - Total del mes, total por persona, detalle de qué compras componen el adeudo de cada quien, mensualidad N de M en MSI.
   - Tu parte (lo que tú gastaste o no se ha asignado) separada.
7. **Vista por persona**: cuánto te debe en total entre todas las tarjetas, histórico, y compras activas con cuántas mensualidades faltan.
8. **Compartir**: botón para copiar/enviar por WhatsApp el resumen del mes a cada persona.

## Flujo del usuario

```text
[Subir PDF] → [Parser extrae compras] → [Match con compras previas]
                                                ↓
                            ┌───── Recurrentes auto-asignadas ─────┐
                            │                                       │
                            └─── Nuevas → modal asignación ────────┘
                                                ↓
                          [Desglose: cuánto debe pagar cada persona]
```

## Arquitectura

```text
src/routes/
  index.tsx                       → Landing/redirige a dashboard si hay sesión
  login.tsx                       → Email+password + Google
  _authenticated.tsx              → Guard de auth
  _authenticated/
    dashboard.tsx                 → Resumen global del mes en curso
    tarjetas.tsx                  → Lista de tarjetas
    tarjetas.$cardId.tsx          → Detalle: estados de cuenta + desglose mensual
    personas.tsx                  → Lista de personas + cuánto debe cada una
    personas.$personId.tsx        → Detalle por persona
    subir.tsx                     → Subir nuevo estado de cuenta

src/lib/
  statements.functions.ts         → uploadStatement, parseStatement, listStatements
  purchases.functions.ts          → assignPurchase, splitPurchase, listMonthBreakdown
  pdf-parser.server.ts            → extracción de transacciones del PDF
  matcher.server.ts               → match de compras recurrentes (comercio+monto+MSI)
```

## Modelo de datos (Lovable Cloud)

- `cards` — id, user_id, bank, alias, last4, color
- `people` — id, user_id, name, phone, color
- `statements` — id, user_id, card_id, period (YYYY-MM), pdf_path, parsed_at
- `purchases` — id, user_id, card_id, statement_id, posted_at, merchant, amount, total_installments, current_installment, installment_amount, signature (hash comercio+monto+MSI para matching), assignment_status
- `purchase_assignments` — id, purchase_id, person_id, share_amount, share_percent (permite split entre varios)
- `merchant_rules` — id, user_id, card_id, signature, person_id (regla aprendida para auto-asignar el próximo mes)

Todas con RLS por `user_id = auth.uid()`. Roles solo "owner" por ahora (sin necesidad de tabla `user_roles`).

## Detalles técnicos

- **Parser de PDF**: el parsing corre en un `createServerFn` usando una librería JS compatible con el runtime Worker (p. ej. `unpdf`). Se valida el archivo (PDF, ≤10 MB) y se intenta extraer texto + tablas. Si la extracción no es confiable para un banco, se muestra al usuario las líneas detectadas para que confirme/corrija antes de guardar.
- **Detección de recurrentes**: se calcula una `signature = hash(normalize(merchant) + monto_mensualidad + total_msi)`. Si esa firma ya tiene `merchant_rule` → auto-asigna; si no → la pone en cola de "pendientes de asignar".
- **MSI (Meses Sin Intereses)**: si una compra dice "1/6", "2/6"... se calcula automáticamente cuántas faltan y se incluye en cada mes hasta llegar al total. La persona ve "Compra Liverpool $5,000 — pago 2 de 6 ($833.33/mes)".
- **Pago de contado (1 sola exhibición)**: total_installments = 1, se cobra completo ese mes.
- **División de compra**: el modal acepta personas + montos exactos o porcentajes; valida que la suma cuadre con el total.
- **Almacenamiento del PDF**: bucket `statements` en Storage (privado, RLS).
- **Seguridad**: validación con Zod en cada server function, RLS estricta, el bucket nunca público.
- **Stack**: TanStack Start + React 19 + Tailwind v4 + shadcn/ui + Lovable Cloud (Supabase) + AI Gateway opcional más adelante si quisiéramos mejorar el parser con visión.

## Fuera de alcance (v1)

- Recordatorios automáticos por WhatsApp/email (solo botón para compartir manual).
- Pagos dentro de la app.
- Soporte multi-usuario (cuentas compartidas).
- Reportes históricos avanzados / exportación a Excel (puede venir después).

## Lo que necesito de ti antes de empezar

Nada bloqueante. Voy a activar Lovable Cloud (login + base de datos + storage para los PDFs). Si después de la primera subida ves que el parser no entiende bien el formato de tu banco en particular, me dices qué banco es y ajustamos la extracción.
