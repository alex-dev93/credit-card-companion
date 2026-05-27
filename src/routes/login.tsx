import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("¡Cuenta creada! Iniciando sesión...");
    navigate({ to: "/dashboard" });
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) return toast.error("No se pudo iniciar sesión con Google");
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 40% at 50% 20%, oklch(0.32 0.08 165 / 0.5), transparent 60%)" }} />
      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5 font-semibold tracking-tight">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary shadow-elegant">
            <CreditCard className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg">Saldo<span className="text-gold">.</span></span>
        </Link>

        <div className="rounded-2xl border border-border/60 bg-gradient-card p-8 shadow-elegant ring-inner-glow">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-gold" />
              Acceso a tu tablero
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">Bienvenido</h1>
            <p className="mt-1 text-sm text-muted-foreground">Entra con tu cuenta para administrar tus tarjetas.</p>
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2 bg-background/40">
              <TabsTrigger value="signin">Iniciar sesión</TabsTrigger>
              <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4">
              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <Label htmlFor="email-in">Email</Label>
                  <Input id="email-in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background/40" />
                </div>
                <div>
                  <Label htmlFor="pw-in">Contraseña</Label>
                  <Input id="pw-in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-background/40" />
                </div>
                <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground shadow-elegant ring-inner-glow" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              <form onSubmit={handleSignUp} className="space-y-3">
                <div>
                  <Label htmlFor="email-up">Email</Label>
                  <Input id="email-up" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background/40" />
                </div>
                <div>
                  <Label htmlFor="pw-up">Contraseña (mín. 6)</Label>
                  <Input id="pw-up" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-background/40" />
                </div>
                <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground shadow-elegant ring-inner-glow" disabled={loading}>
                  {loading ? "Creando..." : "Crear cuenta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            <div className="h-px flex-1 bg-border/60" /> o continúa con <div className="h-px flex-1 bg-border/60" />
          </div>

          <Button variant="outline" className="w-full border-border/60 bg-background/40" onClick={handleGoogle}>
            Continuar con Google
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Al continuar aceptas tener mejor control de tus tarjetas prestadas.
        </p>
      </div>
    </div>
  );
}
