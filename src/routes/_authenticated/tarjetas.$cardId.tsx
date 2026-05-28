import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, FileText, Trash2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { listStatements, deleteStatement } from "@/lib/statements.functions";
import { getMonthBreakdown, deletePurchase } from "@/lib/purchases.functions";
import { AssignPurchaseDialog } from "@/components/AssignPurchaseDialog";
import { ManualPurchaseDialog } from "@/components/ManualPurchaseDialog";
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

  return (
    <div className="space-y-6">
      <Link to="/tarjetas" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Volver
      </Link>
      {card && (
        <div className="rounded-xl border p-5 text-white" style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>
          <div className="text-sm opacity-90">{card.bank}</div>
          <div className="text-xl font-semibold">{card.alias}</div>
          <div className="mt-2 font-mono">•••• {card.last4 || "····"}</div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Periodos</h2>
        {statements.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Aún no hay estados de cuenta. <Link to="/subir" className="text-primary underline">Sube uno</Link>.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
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
            <div className="flex items-center justify-between border-b p-3">
              <div className="font-semibold">Compras del periodo</div>
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
            <ul className="divide-y">
              {breakdown.purchases.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Sin compras detectadas</li>}
              {breakdown.purchases.map((p) => (
                <li key={p.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.merchant}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.posted_at} · {p.total_installments > 1 ? `MSI ${p.current_installment}/${p.total_installments}` : "Contado"}
                      </div>
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
                      <div className="font-semibold">{fmt(p.installment_amount)}</div>
                      <button
                        onClick={() => setAssignFor(p.id)}
                        className={`mt-1 text-xs underline ${p.assignment_status === "pending" ? "text-destructive font-semibold" : "text-primary"}`}
                      >
                        {p.assignment_status === "pending" ? "Asignar" : "Editar"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
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
