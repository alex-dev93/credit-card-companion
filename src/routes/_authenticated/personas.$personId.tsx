import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPersonBreakdown, generatePersonPdf } from "@/lib/person.functions";
import { nextDateForDay, daysUntil, fmtDate } from "@/lib/card-dates";
import { toast } from "sonner";

function fmt(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export const Route = createFileRoute("/_authenticated/personas/$personId")({
  component: PersonDetail,
});

function PersonDetail() {
  const { personId } = Route.useParams();
  const breakdownFn = useServerFn(getPersonBreakdown);
  const pdfFn = useServerFn(generatePersonPdf);

  const { data, isLoading } = useQuery({
    queryKey: ["person-breakdown", personId],
    queryFn: () => breakdownFn({ data: { person_id: personId } }),
  });

  const pdfMut = useMutation({
    mutationFn: () => pdfFn({ data: { person_id: personId } }),
    onSuccess: (res) => {
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${res.base64}`;
      link.download = res.filename;
      link.click();
      toast.success("PDF generado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;
  if (!data) return <div className="p-8 text-center">Sin datos</div>;

  return (
    <div className="space-y-6">
      <Link to="/personas" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" />Volver
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full" style={{ background: data.person.color }} />
          <div>
            <div className="text-xl font-bold">{data.person.name}</div>
            {data.person.phone && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Phone className="h-3 w-3" />{data.person.phone}
              </div>
            )}
          </div>
        </div>
        <Button onClick={() => pdfMut.mutate()} disabled={pdfMut.isPending}>
          <Download className="mr-2 h-4 w-4" />{pdfMut.isPending ? "Generando…" : "Descargar PDF"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Debe este mes</div>
          <div className="mt-1 text-2xl font-bold">{fmt(data.totalMonth)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Pendiente total (con MSI futuros)</div>
          <div className="mt-1 text-2xl font-bold">{fmt(data.totalRemaining)}</div>
        </div>
      </div>

      {data.cards.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          {data.person.name} no tiene compras asignadas.
        </div>
      ) : (
        data.cards.map((g) => {
          const payDate = g.card.payment_day ? nextDateForDay(g.card.payment_day) : null;
          const days = payDate ? daysUntil(payDate) : null;
          return (
            <div key={g.card.id} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4" style={{ borderTopColor: g.card.color, borderTopWidth: 3, borderTopStyle: "solid" }}>
                <div>
                  <div className="font-semibold">{g.card.bank} · {g.card.alias}</div>
                  <div className="text-xs text-muted-foreground">•••• {g.card.last4 ?? "····"}</div>
                </div>
                <div className="text-right text-sm">
                  {payDate && (
                    <div className={days !== null && days <= 5 ? "font-semibold text-destructive" : "text-muted-foreground"}>
                      Pago: {fmtDate(payDate)} {days !== null && `(en ${days}d)`}
                    </div>
                  )}
                  <div className="font-semibold">{fmt(g.totalMonth)}</div>
                  {g.totalRemaining > g.totalMonth && (
                    <div className="text-xs text-muted-foreground">Pendiente total: {fmt(g.totalRemaining)}</div>
                  )}
                </div>
              </div>
              <ul className="divide-y">
                {g.items.map((it) => (
                  <li key={it.purchase_id} className="flex items-start justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{it.merchant}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.period}
                        {it.total_installments > 1 && ` · Pago ${it.current_installment}/${it.total_installments} · faltan ${it.remaining_installments} (${fmt(it.remaining_amount)})`}
                      </div>
                    </div>
                    <div className="text-right font-semibold">{fmt(it.share_amount)}</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}
