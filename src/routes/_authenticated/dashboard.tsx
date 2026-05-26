import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Users, Upload, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPersonTotals } from "@/lib/purchases.functions";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const period = currentPeriod();
  const fn = useServerFn(getPersonTotals);
  const opts = queryOptions({
    queryKey: ["personTotals", period],
    queryFn: () => fn({ data: { period } }),
  });
  const { data: totals } = useSuspenseQuery(opts);

  const grandTotal = totals.reduce((s, t) => s + t.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Resumen del mes</h1>
        <p className="text-sm text-muted-foreground">Periodo {period}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total por cobrar</span>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 text-3xl font-bold">{formatCurrency(grandTotal)}</div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm text-muted-foreground">Personas con adeudo</div>
          <div className="mt-2 text-3xl font-bold">{totals.length}</div>
        </div>
        <Link to="/subir" className="rounded-xl border bg-primary p-5 text-primary-foreground transition-opacity hover:opacity-90">
          <div className="flex items-center justify-between text-sm">
            <span>Subir estado de cuenta</span>
            <Upload className="h-4 w-4" />
          </div>
          <div className="mt-2 text-lg font-semibold">Sube tu PDF del mes</div>
        </Link>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b p-4 font-semibold">Cuánto te debe cada persona este mes</div>
        {totals.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aún no hay datos para {period}.<br />
            <div className="mt-4 flex justify-center gap-2">
              <Link to="/tarjetas"><Button variant="outline" size="sm"><CreditCard className="mr-2 h-4 w-4" />Agregar tarjeta</Button></Link>
              <Link to="/personas"><Button variant="outline" size="sm"><Users className="mr-2 h-4 w-4" />Agregar persona</Button></Link>
              <Link to="/subir"><Button size="sm"><Upload className="mr-2 h-4 w-4" />Subir PDF</Button></Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y">
            {totals.map((t) => (
              <li key={t.person_id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full" style={{ background: t.color }} />
                  <div className="font-medium">{t.name}</div>
                </div>
                <div className="text-lg font-semibold">{formatCurrency(t.total)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
