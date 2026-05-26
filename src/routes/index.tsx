import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CreditCard, Users, Upload, Sparkles } from "lucide-react";
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
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <CreditCard className="h-5 w-5 text-primary" />
            Mis Tarjetas
          </div>
          <Link to="/login">
            <Button variant="outline" size="sm">Entrar</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <h1 className="text-5xl font-bold tracking-tight text-foreground">
            Lleva el control de tus tarjetas prestadas.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Sube tu estado de cuenta en PDF y la app reparte automáticamente cada compra entre las personas a quienes les prestaste la tarjeta. Mes con mes sabrás exactamente cuánto te debe pagar cada quien.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/login">
              <Button size="lg">Empezar gratis</Button>
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          <Feature icon={<Upload className="h-5 w-5" />} title="Sube tu PDF" desc="El sistema lee tus compras del estado de cuenta automáticamente." />
          <Feature icon={<Users className="h-5 w-5" />} title="Asigna a cada persona" desc="Divide compras, registra MSI y agrega personas sobre la marcha." />
          <Feature icon={<Sparkles className="h-5 w-5" />} title="Detecta recurrentes" desc="Las compras que se repiten cada mes se asignan solas a la misma persona." />
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
