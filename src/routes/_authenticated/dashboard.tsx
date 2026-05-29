import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Users, Upload, TrendingUp, ArrowRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPersonTotals } from "@/lib/purchases.functions";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatPeriod(p: string) {
  const [y, m] = p.split("-");
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
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
  const { data: summary } = useSuspenseQuery(opts);

  const totals = summary.people;
  const grandTotal = summary.total;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Resumen del periodo</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{formatPeriod(period)}</h1>
        </div>
        <Link to="/subir">
          <Button className="bg-gradient-primary text-primary-foreground shadow-elegant ring-inner-glow">
            <Upload className="mr-2 h-4 w-4" /> Subir estado de cuenta
          </Button>
        </Link>
      </div>

      {/* Stat bento */}
      <div className="grid gap-4 sm:grid-cols-6">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-elegant ring-inner-glow sm:col-span-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Total por cobrar</div>
              <div className="mt-3 font-display text-4xl font-bold tracking-tight">{formatCurrency(grandTotal)}</div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary-glow">
                <TrendingUp className="h-3 w-3" />
                {summary.purchaseCount} compra{summary.purchaseCount === 1 ? "" : "s"} detectada{summary.purchaseCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-gold shadow-gold">
              <Wallet className="h-5 w-5 text-gold-foreground" />
            </div>
          </div>
          <div className="pointer-events-none absolute -bottom-12 -right-12 h-48 w-48 rounded-full opacity-20" style={{ background: "radial-gradient(circle, var(--gold), transparent 70%)" }} />
        </div>

        <Link to="/tarjetas" className="group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-elegant ring-inner-glow transition-all hover:border-primary/40 sm:col-span-3">
          <div className="flex h-full items-center justify-between">
            <div>
              <CreditCard className="h-5 w-5 text-primary-glow" />
              <div className="mt-3 font-display text-lg font-semibold">Administrar tarjetas</div>
              <div className="mt-1 text-xs text-muted-foreground">Agregar, ver periodos y compras</div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
          </div>
        </Link>
      </div>

      {/* Per-person breakdown */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-card shadow-elegant ring-inner-glow">
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Cuánto te debe cada persona</h2>
            <p className="text-xs text-muted-foreground">Periodo {formatPeriod(period)}</p>
          </div>
          <Link to="/personas">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Users className="mr-1.5 h-4 w-4" /> Personas
            </Button>
          </Link>
        </div>

        {totals.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
              <Upload className="h-6 w-6 text-primary-glow" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {summary.purchaseCount > 0 ? `${summary.purchaseCount} compras detectadas, pendientes por asignar.` : "Aún no hay datos para este mes."}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.purchaseCount > 0 ? `Total pendiente: ${formatCurrency(summary.pendingTotal)}.` : "Configura tu primera tarjeta y sube un estado de cuenta para empezar."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link to="/tarjetas"><Button variant="outline" size="sm" className="border-border/60"><CreditCard className="mr-2 h-4 w-4" />Tarjeta</Button></Link>
              <Link to="/personas"><Button variant="outline" size="sm" className="border-border/60"><Users className="mr-2 h-4 w-4" />Persona</Button></Link>
              <Link to="/subir"><Button size="sm" className="bg-gradient-primary text-primary-foreground"><Upload className="mr-2 h-4 w-4" />Subir PDF</Button></Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {totals.map((t) => {
              const pct = grandTotal > 0 ? (t.total / grandTotal) * 100 : 0;
              return (
                <li key={t.person_id} className="group relative px-6 py-4 transition-colors hover:bg-card/60">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white shadow-elegant" style={{ background: t.color }}>
                        {t.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{pct.toFixed(0)}% del total</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-lg font-semibold tabular-nums">{formatCurrency(t.total)}</div>
                    </div>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-background/60">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${t.color}, color-mix(in oklab, ${t.color} 60%, white))` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
