import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, FileText, Trash2, Plus, X, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { listStatements, deleteStatement } from "@/lib/statements.functions";
import { getMonthBreakdown, deletePurchase } from "@/lib/purchases.functions";
import { AssignPurchaseDialog } from "@/components/AssignPurchaseDialog";
import { ManualPurchaseDialog } from "@/components/ManualPurchaseDialog";
import { nextDateForDay, daysUntil, fmtDate } from "@/lib/card-dates";
import { toast } from "sonner";


function fmt(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export const Route = createFileRoute("/_authenticated/tarjetas/$cardId")({
  component: CardDetail,
});

function CardDetail() {
  const { cardId } = Route.useParams();
  const listFn = useServerFn(listStatements);
  const deleteFn = useServerFn(deleteStatement);
  const breakdownFn = useServerFn(getMonthBreakdown);
  const delPurchaseFn = useServerFn(deletePurchase);


  const { data: card } = useQuery({
    queryKey: ["card", cardId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select("*").eq("id", cardId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: statements = [], refetch: refetchStmts } = useQuery({
    queryKey: ["statements", cardId],
    queryFn: () => listFn({ data: { card_id: cardId } }),
  });

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const period = selectedPeriod ?? statements[0]?.period ?? null;

  const { data: breakdown, refetch: refetchBreakdown } = useQuery({
    queryKey: ["breakdown", cardId, period],
    queryFn: () => period ? breakdownFn({ data: { card_id: cardId, period } }) : null,
    enabled: !!period,
  });
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPeriod, setManualPeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/tarjetas" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" /> Volver
        </Link>
        <Button onClick={() => { setManualPeriod(period ?? manualPeriod); setManualOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" />Agregar compra manual
        </Button>
      </div>
      {card && (() => {
        const used = breakdown?.total ?? 0;
        const available = card.credit_limit != null ? Math.max(0, Number(card.credit_limit) - used) : null;
        const cutDate = card.cut_day ? nextDateForDay(card.cut_day) : null;
        const payDate = card.payment_day ? nextDateForDay(card.payment_day) : null;
        const daysToPay = payDate ? daysUntil(payDate) : null;
        return (
          <div className="space-y-3">
            <div className="rounded-xl border p-5 text-white" style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>
              <div className="text-sm opacity-90">{card.bank}</div>
              <div className="text-xl font-semibold">{card.alias}</div>
              <div className="mt-2 font-mono">•••• {card.last4 || "····"}</div>
              {card.credit_limit != null && available != null && (
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-background/20 p-3 text-xs">
                  <div><div className="opacity-80">Disponible</div><div className="text-base font-bold">{fmt(available)}</div></div>
                  <div><div className="opacity-80">Límite</div><div className="text-base font-bold">{fmt(Number(card.credit_limit))}</div></div>
                </div>
              )}
            </div>
            {(cutDate || payDate) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {cutDate && (
                  <div className="rounded-lg border bg-card p-3 text-sm">
                    <div className="flex items-center gap-1 text-xs uppercase text-muted-foreground"><CalendarClock className="h-3 w-3" />Próximo corte</div>
                    <div className="mt-1 font-semibold">{fmtDate(cutDate)} · en {daysUntil(cutDate)}d</div>
                  </div>
                )}
                {payDate && (
                  <div className={`rounded-lg border p-3 text-sm ${daysToPay !== null && daysToPay <= 5 ? "border-destructive/50 bg-destructive/5" : "bg-card"}`}>
                    <div className="flex items-center gap-1 text-xs uppercase text-muted-foreground"><CalendarClock className="h-3 w-3" />Próximo pago</div>
                    <div className="mt-1 font-semibold">{fmtDate(payDate)} · en {daysToPay}d</div>
                    {card.no_interest_payment != null && <div className="text-xs text-muted-foreground">Sin intereses: {fmt(Number(card.no_interest_payment))}</div>}
                    {card.min_payment != null && <div className="text-xs text-muted-foreground">Mínimo: {fmt(Number(card.min_payment))}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}



      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Periodos</h2>
        {statements.length === 0 ? (
          <div className="space-y-3 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            <div>Aún no hay estados de cuenta para esta tarjeta.</div>
            <div className="flex flex-wrap gap-2">
              <Link to="/subir"><Button size="sm" variant="outline">Subir PDF</Button></Link>
              <Button size="sm" onClick={() => setManualOpen(true)}><Plus className="mr-1 h-4 w-4" />Capturar compras a mano</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {statements.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedPeriod(s.period)}
                className={`rounded-md border px-3 py-1.5 text-sm ${period === s.period ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
              >
                <FileText className="mr-1 inline h-3.5 w-3.5" />{s.period}
              </button>
            ))}
          </div>
        )}

      </div>

      {breakdown && period && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Total mes" value={fmt(breakdown.total)} />
            <Stat label="Asignado" value={fmt(breakdown.total - breakdown.mine - breakdown.pending)} />
            <Stat label="Mío" value={fmt(breakdown.mine)} />
            <Stat label="Pendiente" value={fmt(breakdown.pending)} highlight={breakdown.pending > 0} />
          </div>

          {breakdown.perPerson.length > 0 && (
            <div className="rounded-xl border bg-card">
              <div className="border-b p-3 font-semibold">Por persona</div>
              <ul className="divide-y">
                {breakdown.perPerson.map((p) => (
                  <li key={p.person_id} className="flex items-center justify-between p-3">
                    <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: p.color }} />{p.name} <span className="text-xs text-muted-foreground">({p.count} compras)</span></span>
                    <span className="font-semibold">{fmt(p.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <div className="font-semibold">Compras del periodo</div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setManualPeriod(period); setManualOpen(true); }}
                  className="text-xs text-primary hover:underline"
                >
                  <Plus className="mr-1 inline h-3 w-3" />Agregar manual
                </button>
                <button
                  onClick={async () => {
                    const st = statements.find((s) => s.period === period);
                    if (!st) return;
                    if (!confirm("¿Eliminar este estado de cuenta y todas sus compras?")) return;
                    await deleteFn({ data: { statement_id: st.id } });
                    toast.success("Eliminado");
                    setSelectedPeriod(null);
                    refetchStmts();
                  }}
                  className="text-xs text-destructive hover:underline"
                >
                  <Trash2 className="mr-1 inline h-3 w-3" />Eliminar periodo
                </button>
              </div>
            </div>
            {breakdown.purchases.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Sin compras todavía. Usa "Agregar manual" para capturarlas.</div>
            ) : (
              (() => {
                const msi = breakdown.purchases.filter((p) => p.total_installments > 1);
                const contado = breakdown.purchases.filter((p) => p.total_installments <= 1);
                const renderItem = (p: typeof breakdown.purchases[number]) => {
                  const remaining = Math.max(0, p.total_installments - p.current_installment);
                  const remainingAmount = remaining * Number(p.installment_amount);
                  return (
                    <li key={p.id} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{p.merchant}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.posted_at} · {p.total_installments > 1
                              ? `Pago ${p.current_installment} de ${p.total_installments} · faltan ${remaining} (${fmt(remainingAmount)})`
                              : "Pago de contado"}
                          </div>
                          {p.total_installments > 1 && (
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div className="h-full bg-primary" style={{ width: `${(p.current_installment / p.total_installments) * 100}%` }} />
                            </div>
                          )}
                          {p.assignments.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {p.assignments.map((a) => (
                                <span key={a.person_id} className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: a.person_color }}>
                                  {a.person_name}: {fmt(a.share_amount)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{fmt(Number(p.installment_amount))}</div>
                          {p.total_installments > 1 && (
                            <div className="text-[10px] text-muted-foreground">total {fmt(Number(p.installment_amount) * p.total_installments)}</div>
                          )}
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <button
                              onClick={() => setAssignFor(p.id)}
                              className={`text-xs underline ${p.assignment_status === "pending" ? "text-destructive font-semibold" : "text-primary"}`}
                            >
                              {p.assignment_status === "pending" ? "Asignar" : "Editar"}
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm("¿Borrar esta compra?")) return;
                                await delPurchaseFn({ data: { purchase_id: p.id } });
                                toast.success("Borrada");
                                refetchBreakdown();
                              }}
                              className="text-xs text-muted-foreground hover:text-destructive"
                              title="Borrar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                };
                const sumMonth = (arr: typeof breakdown.purchases) => arr.reduce((s, p) => s + Number(p.installment_amount), 0);
                return (
                  <div>
                    {msi.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                          <span>Meses sin intereses ({msi.length})</span>
                          <span>{fmt(sumMonth(msi))}</span>
                        </div>
                        <ul className="divide-y">{msi.map(renderItem)}</ul>
                      </div>
                    )}
                    {contado.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                          <span>Contado ({contado.length})</span>
                          <span>{fmt(sumMonth(contado))}</span>
                        </div>
                        <ul className="divide-y">{contado.map(renderItem)}</ul>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </>
      )}

      {assignFor && (
        <AssignPurchaseDialog
          purchaseId={assignFor}
          open={!!assignFor}
          onClose={() => setAssignFor(null)}
          onSaved={() => { refetchBreakdown(); setAssignFor(null); }}
        />
      )}

      <ManualPurchaseDialog
        cardId={cardId}
        period={manualPeriod}
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSaved={() => { setManualOpen(false); refetchStmts(); refetchBreakdown(); }}
      />

    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-destructive/50 bg-destructive/5" : "bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
