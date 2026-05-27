import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CreditCard, Users, Upload, Sparkles, ArrowRight, Repeat, FileText, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary shadow-elegant">
              <CreditCard className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display">Saldo<span className="text-gold">.</span></span>
          </div>
          <Link to="/login">
            <Button variant="outline" size="sm" className="border-border/60">Entrar</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-20 pb-24">
        {/* Hero */}
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3 text-gold" />
            Para quienes prestan su tarjeta y odian sacar cuentas
          </div>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Toma el control de tus
            <br />
            <span className="bg-gradient-to-r from-primary via-primary-glow to-gold bg-clip-text text-transparent">
              tarjetas prestadas.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Sube tu estado de cuenta en PDF. La app reparte cada compra, calcula MSI y te dice exactamente cuánto te debe pagar cada quien.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/login">
              <Button size="lg" className="bg-gradient-primary text-primary-foreground shadow-elegant ring-inner-glow hover:opacity-95">
                Empezar gratis <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="border-border/60 backdrop-blur">Ver cómo funciona</Button>
            </Link>
          </div>
        </div>

        {/* Bento grid */}
        <div className="mt-24 grid auto-rows-[180px] grid-cols-1 gap-4 sm:grid-cols-6">
          {/* Big — PDF parser */}
          <Card className="sm:col-span-4 sm:row-span-2">
            <div className="flex h-full flex-col justify-between p-7">
              <div className="flex items-start justify-between">
                <div>
                  <Pill icon={<Upload className="h-3 w-3" />}>Auto-detección</Pill>
                  <h3 className="mt-4 font-display text-2xl font-semibold leading-tight">
                    Sube el PDF del banco. Listo.
                  </h3>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    Leemos cada compra del estado de cuenta, identificamos MSI ("3/6") y separamos contado de mensualidades.
                  </p>
                </div>
                <FileText className="h-6 w-6 text-gold/70" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Chip>BBVA</Chip>
                <Chip>Banamex</Chip>
                <Chip>Santander</Chip>
                <Chip>Banorte</Chip>
                <Chip>HSBC</Chip>
                <Chip>+ más</Chip>
              </div>
            </div>
          </Card>

          {/* Recurrentes */}
          <Card className="sm:col-span-2">
            <div className="flex h-full flex-col justify-between p-6">
              <Repeat className="h-5 w-5 text-primary-glow" />
              <div>
                <div className="font-display text-lg font-semibold">Recurrentes auto-asignadas</div>
                <p className="mt-1 text-xs text-muted-foreground">Netflix de Ana siempre será de Ana.</p>
              </div>
            </div>
          </Card>

          {/* Personas */}
          <Card className="sm:col-span-2">
            <div className="flex h-full flex-col justify-between p-6">
              <Users className="h-5 w-5 text-gold" />
              <div>
                <div className="font-display text-lg font-semibold">Divide entre quien sea</div>
                <p className="mt-1 text-xs text-muted-foreground">Porcentajes, partes iguales o lo tuyo.</p>
              </div>
            </div>
          </Card>

          {/* Múltiples tarjetas */}
          <Card className="sm:col-span-3">
            <div className="flex h-full items-center gap-5 p-6">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-primary shadow-elegant">
                <CreditCard className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <div className="font-display text-lg font-semibold">Todas tus tarjetas</div>
                <p className="mt-1 text-xs text-muted-foreground">BBVA, Banamex, Amex — desglose por tarjeta y persona.</p>
              </div>
            </div>
          </Card>

          {/* Resumen */}
          <Card className="sm:col-span-3">
            <div className="flex h-full items-center gap-5 p-6">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-gold shadow-gold">
                <Wallet className="h-6 w-6 text-gold-foreground" />
              </div>
              <div>
                <div className="font-display text-lg font-semibold">Cuánto te paga cada quien</div>
                <p className="mt-1 text-xs text-muted-foreground">Resumen mensual claro para enviar por WhatsApp.</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Trust */}
        <div className="mt-20 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-primary-glow" />Tus PDFs viven privados en tu cuenta</span>
          <span>·</span>
          <span>Cifrado en tránsito</span>
          <span>·</span>
          <span>Sin compartir datos con terceros</span>
        </div>
      </main>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-card shadow-elegant ring-inner-glow transition-all hover:border-primary/30 ${className}`}>
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: "radial-gradient(circle at 30% 0%, oklch(0.62 0.13 165 / 0.10), transparent 60%)" }} />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

function Pill({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary-glow">
      {icon}
      {children}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5 text-center font-mono text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}
