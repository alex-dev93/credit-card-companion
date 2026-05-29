import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, CreditCard, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getCardSummaries } from "@/lib/purchases.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tarjetas")({
  component: CardsPage,
});

interface Card {
  id: string;
  bank: string;
  alias: string;
  last4: string | null;
  color: string;
}

function CardsPage() {
  const qc = useQueryClient();
  const summariesFn = useServerFn(getCardSummaries);
  const { data: cards = [] } = useQuery({
    queryKey: ["cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("id, bank, alias, last4, color")
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
  const [bank, setBank] = useState("");
  const [alias, setAlias] = useState("");
  const [last4, setLast4] = useState("");
  const [color, setColor] = useState("#6366f1");

  const createMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("No auth");
      const { error } = await supabase.from("cards").insert({
        user_id: u.user.id,
        bank, alias, last4: last4 || null, color,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarjeta agregada");
      setOpen(false);
      setBank(""); setAlias(""); setLast4(""); setColor("#6366f1");
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
            <Button><Plus className="mr-2 h-4 w-4" />Agregar</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva tarjeta</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }} className="space-y-3">
              <div><Label>Banco</Label><Input value={bank} onChange={(e) => setBank(e.target.value)} required placeholder="BBVA" /></div>
              <div><Label>Alias</Label><Input value={alias} onChange={(e) => setAlias(e.target.value)} required placeholder="Platino" /></div>
              <div><Label>Últimos 4 (opcional)</Label><Input value={last4} onChange={(e) => setLast4(e.target.value)} maxLength={4} pattern="\d*" /></div>
              <div><Label>Color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20" /></div>
              <Button type="submit" className="w-full" disabled={createMut.isPending}>Guardar</Button>
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
          {cards.map((c) => (
            <div key={c.id} className="relative overflow-hidden rounded-xl border p-5 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>
              <div className="flex items-center justify-between">
                <CreditCard className="h-6 w-6" />
                <button onClick={() => { if (confirm("¿Eliminar tarjeta y todos sus estados de cuenta?")) deleteMut.mutate(c.id); }} className="opacity-60 hover:opacity-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-8 font-mono text-lg">•••• {c.last4 || "····"}</div>
              <div className="mt-1 text-sm opacity-90">{c.bank}</div>
              <div className="font-semibold">{c.alias}</div>
              {summaryByCard.get(c.id) && (
                <div className="mt-3 rounded-md bg-background/20 px-3 py-2 text-xs">
                  {summaryByCard.get(c.id)?.purchaseCount} compras · {summaryByCard.get(c.id)?.pendingCount} pendientes · {summaryByCard.get(c.id)?.latestPeriod}
                </div>
              )}
              <Link to="/tarjetas/$cardId" params={{ cardId: c.id }} className="absolute inset-0" aria-label="Ver detalle" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
