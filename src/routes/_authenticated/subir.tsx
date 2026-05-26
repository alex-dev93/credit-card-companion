import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadAndParseStatement } from "@/lib/statements.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/subir")({
  component: UploadPage,
});

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function UploadPage() {
  const navigate = useNavigate();
  const upload = useServerFn(uploadAndParseStatement);
  const [cardId, setCardId] = useState<string>("");
  const [period, setPeriod] = useState(currentPeriod());
  const [file, setFile] = useState<File | null>(null);

  const { data: cards = [] } = useQuery({
    queryKey: ["cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cards").select("id, bank, alias, last4");
      if (error) throw error;
      return data;
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!file || !cardId) throw new Error("Selecciona tarjeta y archivo");
      if (file.size > 10 * 1024 * 1024) throw new Error("El PDF debe ser menor a 10 MB");

      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      return upload({ data: { card_id: cardId, period, pdf_base64: base64, filename: file.name } });
    },
    onSuccess: (res) => {
      if (res.warning) toast.warning(res.warning);
      else toast.success(`¡Listo! ${res.parsed} compras detectadas (${res.autoAssigned} auto-asignadas, ${res.pending} por asignar)`);
      navigate({ to: "/tarjetas/$cardId", params: { cardId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Subir estado de cuenta</h1>
        <p className="text-sm text-muted-foreground">Selecciona la tarjeta, el periodo y el PDF que te mandó el banco.</p>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Primero agrega una tarjeta en la sección Tarjetas.
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4 rounded-xl border bg-card p-6">
          <div>
            <Label>Tarjeta</Label>
            <Select value={cardId} onValueChange={setCardId}>
              <SelectTrigger><SelectValue placeholder="Elige tarjeta" /></SelectTrigger>
              <SelectContent>
                {cards.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.bank} — {c.alias} {c.last4 ? `····${c.last4}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Periodo (mes del corte)</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
          </div>

          <div>
            <Label>PDF del estado de cuenta</Label>
            <label className="mt-1 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center hover:bg-muted/30">
              {file ? (
                <><FileText className="h-8 w-8 text-primary" /><span className="text-sm font-medium">{file.name}</span><span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span></>
              ) : (
                <><Upload className="h-8 w-8 text-muted-foreground" /><span className="text-sm">Haz clic para elegir el PDF</span><span className="text-xs text-muted-foreground">Máx. 10 MB</span></>
              )}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <Button type="submit" className="w-full" disabled={mut.isPending || !file || !cardId}>
            {mut.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Procesando...</>) : "Subir y analizar"}
          </Button>
          <p className="text-xs text-muted-foreground">El sistema detectará tus compras automáticamente y te avisará si alguna es recurrente (ya asignada a una persona el mes anterior).</p>
        </form>
      )}
    </div>
  );
}
