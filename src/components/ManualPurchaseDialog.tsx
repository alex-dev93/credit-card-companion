import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createManualPurchase } from "@/lib/purchases.functions";
import { toast } from "sonner";

interface Props {
  cardId: string;
  period: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ManualPurchaseDialog({ cardId, period, open, onClose, onSaved }: Props) {
  const createFn = useServerFn(createManualPurchase);
  const [merchant, setMerchant] = useState("");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [current, setCurrent] = useState("1");
  const [total, setTotal] = useState("1");
  const [postedAt, setPostedAt] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(installmentAmount);
      if (!merchant.trim() || !amt || amt <= 0) throw new Error("Completa comercio y monto");
      const tot = Math.max(1, parseInt(total, 10) || 1);
      const cur = Math.min(tot, Math.max(1, parseInt(current, 10) || 1));
      return createFn({
        data: {
          card_id: cardId,
          period,
          merchant: merchant.trim(),
          installment_amount: amt,
          current_installment: cur,
          total_installments: tot,
          posted_at: postedAt || null,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(res.autoAssigned ? "Compra agregada y asignada automáticamente" : "Compra agregada");
      setMerchant(""); setInstallmentAmount(""); setCurrent("1"); setTotal("1"); setPostedAt("");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar compra manual</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
          className="space-y-4"
        >
          <div>
            <Label>Comercio</Label>
            <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Ej. AMAZON MX" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto del mes (MXN)</Label>
              <Input type="number" step="0.01" min="0" value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} required />
            </div>
            <div>
              <Label>Fecha (opcional)</Label>
              <Input type="date" value={postedAt} onChange={(e) => setPostedAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mensualidad #</Label>
              <Input type="number" min="1" max="60" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div>
              <Label>Total de meses (1 = contado)</Label>
              <Input type="number" min="1" max="60" value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Guardando..." : "Agregar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
