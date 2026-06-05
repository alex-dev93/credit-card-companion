import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, CreditCard, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getCardSummaries } from "@/lib/purchases.functions";
import { nextDateForDay, daysUntil, fmtDate } from "@/lib/card-dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tarjetas")({
  component: CardsRouteShell,
});

interface Card {
  id: string;
  bank: string;
  alias: string;
  last4: string | null;
  color: string;
  credit_limit: number | null;
  cut_day: number | null;
  payment_day: number | null;
  min_payment: number | null;
  no_interest_payment: number | null;
}

function CardsRouteShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/tarjetas") return <Outlet />;
  return <CardsPage />;
}

const fmtMoney = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

interface FormState {
  bank: string; alias: string; last4: string; color: string;
  credit_limit: string; cut_day: string; payment_day: string;
  min_payment: string; no_interest_payment: string;
}
const emptyForm: FormState = { bank: "", alias: "", last4: "", color: "#6366f1", credit_limit: "", cut_day: "", payment_day: "", min_payment: "", no_interest_payment: "" };

function CardsPage() {
  const qc = useQueryClient();
  const summariesFn = useServerFn(getCardSummaries);
  const { data: cards = [] } = useQuery({
    queryKey: ["cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("id, bank, alias, last4, color, credit_limit, cut_day, payment_day, min_payment, no_interest_payment")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Card[];
    },
  });

  const { data: summaries = [] } = useQuery({
    queryKey: ["card-summaries"],
    queryFn: () => summariesFn(),
  });
  const summaryByCard = new Map(summaries.map((s) => [s.card_id, s]));

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (c: Card) => {
    setEditingId(c.id);
    setForm({
      bank: c.bank, alias: c.alias, last4: c.last4 ?? "", color: c.color,
      credit_limit: c.credit_limit?.toString() ?? "",
      cut_day: c.cut_day?.toString() ?? "",
      payment_day: c.payment_day?.toString() ?? "",
      min_payment: c.min_payment?.toString() ?? "",
      no_interest_payment: c.no_interest_payment?.toString() ?? "",
    });
    setOpen(true);
  };

  const toNum = (s: string) => (s.trim() === "" ? null : Number(s));

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("No auth");
      const payload = {
        bank: form.bank,
        alias: form.alias,
        last4: form.last4 || null,
        color: form.color,
        credit_limit: toNum(form.credit_limit),
        cut_day: toNum(form.cut_day),
        payment_day: toNum(form.payment_day),
        min_payment: toNum(form.min_payment),
        no_interest_payment: toNum(form.no_interest_payment),
      };
      if (editingId) {
        const { error } = await supabase.from("cards").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cards").insert({ user_id: u.user.id, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Tarjeta actualizada" : "Tarjeta agregada");
      setOpen(false); setEditingId(null); setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["cards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarjeta eliminada");
      qc.invalidateQueries({ queryKey: ["cards"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis tarjetas</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Agregar</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Editar tarjeta" : "Nueva tarjeta"}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }} className="space-y-3">
              <div><Label>Banco</Label><Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} required placeholder="BBVA" /></div>
              <div><Label>Alias</Label><Input value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value })} required placeholder="Platino" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Últimos 4</Label><Input value={form.last4} onChange={(e) => setForm({ ...form, last4: e.target.value })} maxLength={4} pattern="\d*" /></div>
                <div><Label>Color</Label><Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-full" /></div>
              </div>
              <div><Label>Límite de crédito</Label><Input type="number" inputMode="decimal" step="0.01" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} placeholder="50000" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Día de corte</Label><Input type="number" min={1} max={31} value={form.cut_day} onChange={(e) => setForm({ ...form, cut_day: e.target.value })} placeholder="15" /></div>
                <div><Label>Día de pago</Label><Input type="number" min={1} max={31} value={form.payment_day} onChange={(e) => setForm({ ...form, payment_day: e.target.value })} placeholder="5" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Pago mínimo</Label><Input type="number" inputMode="decimal" step="0.01" value={form.min_payment} onChange={(e) => setForm({ ...form, min_payment: e.target.value })} /></div>
                <div><Label>Pago sin intereses</Label><Input type="number" inputMode="decimal" step="0.01" value={form.no_interest_payment} onChange={(e) => setForm({ ...form, no_interest_payment: e.target.value })} /></div>
              </div>
              <Button type="submit" className="w-full" disabled={saveMut.isPending}>Guardar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          Aún no tienes tarjetas. Agrega la primera para empezar.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const summary = summaryByCard.get(c.id);
            const used = summary?.total ?? 0;
            const available = c.credit_limit != null ? Math.max(0, c.credit_limit - used) : null;
            const payDate = c.payment_day ? nextDateForDay(c.payment_day) : null;
            const days = payDate ? daysUntil(payDate) : null;
            return (
              <div key={c.id} className="relative overflow-hidden rounded-xl border p-5 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>
                <div className="relative z-10 flex items-center justify-between">
                  <CreditCard className="h-6 w-6" />
                  <div className="flex gap-2">
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(c); }} className="opacity-60 hover:opacity-100" title="Editar"><Pencil className="h-4 w-4" /></button>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm("¿Eliminar tarjeta y todos sus estados de cuenta?")) deleteMut.mutate(c.id); }} className="opacity-60 hover:opacity-100" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-6 font-mono text-lg">•••• {c.last4 || "····"}</div>
                <div className="mt-1 text-sm opacity-90">{c.bank}</div>
                <div className="font-semibold">{c.alias}</div>
                {available != null && (
                  <div className="mt-3 rounded-md bg-background/20 px-3 py-2 text-xs">
                    <div className="flex justify-between"><span className="opacity-80">Disponible</span><span className="font-semibold">{fmtMoney(available)}</span></div>
                    <div className="flex justify-between opacity-80"><span>Límite</span><span>{fmtMoney(c.credit_limit ?? 0)}</span></div>
                  </div>
                )}
                {summary && (
                  <div className="mt-2 text-xs opacity-90">
                    {summary.purchaseCount} compras · {summary.pendingCount} pendientes
                  </div>
                )}
                {payDate && (
                  <div className={`mt-2 text-xs ${days !== null && days <= 5 ? "rounded bg-destructive/80 px-2 py-1 font-semibold" : "opacity-90"}`}>
                    Pago: {fmtDate(payDate)}{days !== null && ` · en ${days}d`}
                  </div>
                )}
                <Link to="/tarjetas/$cardId" params={{ cardId: c.id }} className="absolute inset-0" aria-label="Ver detalle" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
