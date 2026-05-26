import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { assignPurchase } from "@/lib/purchases.functions";
import { toast } from "sonner";

interface Props {
  purchaseId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface Person { id: string; name: string; color: string }

export function AssignPurchaseDialog({ purchaseId, open, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const assignFn = useServerFn(assignPurchase);

  const { data: purchase } = useQuery({
    queryKey: ["purchase", purchaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, merchant, installment_amount, total_installments, current_installment")
        .eq("id", purchaseId).single();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("id, name, color").order("name");
      if (error) throw error;
      return data as Person[];
    },
    enabled: open,
  });

  // selected: map person_id -> percent
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [remember, setRemember] = useState(true);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (open) {
      setSelected({});
      setRemember(true);
      setNewName("");
    }
  }, [open, purchaseId]);

  const togglePerson = (id: string) => {
    setSelected((cur) => {
      if (cur[id] !== undefined) {
        const { [id]: _, ...rest } = cur;
        return distributeEvenly(rest);
      }
      return distributeEvenly({ ...cur, [id]: 0 });
    });
  };

  const distributeEvenly = (map: Record<string, number>) => {
    const keys = Object.keys(map);
    if (keys.length === 0) return map;
    const per = +(100 / keys.length).toFixed(2);
    const out: Record<string, number> = {};
    keys.forEach((k, i) => { out[k] = i === keys.length - 1 ? +(100 - per * (keys.length - 1)).toFixed(2) : per; });
    return out;
  };

  const setPct = (id: string, val: number) => setSelected((c) => ({ ...c, [id]: val }));

  const addPerson = async () => {
    if (!newName.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase.from("people").insert({
      user_id: u.user.id, name: newName.trim(),
      color: `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`,
    }).select("id").single();
    if (error) return toast.error(error.message);
    setNewName("");
    qc.invalidateQueries({ queryKey: ["people"] });
    if (data) setSelected((cur) => distributeEvenly({ ...cur, [data.id]: 0 }));
  };

  const mut = useMutation({
    mutationFn: async () => {
      const assignments = Object.entries(selected).map(([person_id, percent]) => ({ person_id, percent }));
      return assignFn({ data: { purchase_id: purchaseId, assignments, remember } });
    },
    onSuccess: () => {
      toast.success("Asignación guardada");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sumPct = Object.values(selected).reduce((a, b) => a + b, 0);
  const charge = purchase ? Number(purchase.installment_amount) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿De quién es esta compra?</DialogTitle>
        </DialogHeader>

        {purchase && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="font-medium">{purchase.merchant}</div>
            <div className="text-muted-foreground">
              {purchase.total_installments > 1
                ? `MSI ${purchase.current_installment}/${purchase.total_installments} · `
                : "Pago de contado · "}
              ${charge.toLocaleString("es-MX", { minimumFractionDigits: 2 })} este mes
            </div>
          </div>
        )}

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {people.map((p) => {
            const isSel = selected[p.id] !== undefined;
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-md border p-2">
                <Checkbox checked={isSel} onCheckedChange={() => togglePerson(p.id)} />
                <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                <span className="flex-1 text-sm">{p.name}</span>
                {isSel && (
                  <div className="flex items-center gap-1">
                    <Input type="number" step="0.01" min="0" max="100" value={selected[p.id]} onChange={(e) => setPct(p.id, Number(e.target.value))} className="h-8 w-20" />
                    <span className="text-xs">%</span>
                    <span className="ml-1 w-20 text-right text-xs text-muted-foreground">
                      ${(charge * (selected[p.id] / 100)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Input placeholder="Agregar nueva persona..." value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button type="button" variant="outline" size="icon" onClick={addPerson}><Plus className="h-4 w-4" /></Button>
        </div>

        {Object.keys(selected).length > 0 && (
          <div className={`text-xs ${Math.abs(sumPct - 100) > 0.5 ? "text-destructive" : "text-muted-foreground"}`}>
            Suma de porcentajes: {sumPct.toFixed(2)}% {Math.abs(sumPct - 100) > 0.5 && "(debe ser 100%)"}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
          Recordar para el próximo mes (auto-asignar si vuelve a aparecer)
        </label>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { setSelected({}); mut.mutate(); }}>
            <X className="mr-1 h-4 w-4" />Es mío
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || (Object.keys(selected).length > 0 && Math.abs(sumPct - 100) > 0.5)}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
