import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/personas")({
  component: PeoplePage,
});

interface Person { id: string; name: string; phone: string | null; color: string }

function PeoplePage() {
  const qc = useQueryClient();
  const { data: people = [] } = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people").select("id, name, phone, color").order("name");
      if (error) throw error;
      return data as Person[];
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [color, setColor] = useState("#10b981");

  const createMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("No auth");
      const { error } = await supabase.from("people").insert({
        user_id: u.user.id, name, phone: phone || null, color,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Persona agregada");
      setOpen(false); setName(""); setPhone(""); setColor("#10b981");
      qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("people").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Personas</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Agregar</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva persona</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }} className="space-y-3">
              <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div><Label>Teléfono (opcional)</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" /></div>
              <div><Label>Color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20" /></div>
              <Button type="submit" className="w-full" disabled={createMut.isPending}>Guardar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {people.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          Agrega a las personas a quienes les prestas las tarjetas.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full" style={{ background: p.color }} />
                <div>
                  <div className="font-medium">{p.name}</div>
                  {p.phone && <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</div>}
                </div>
              </div>
              <button onClick={() => { if (confirm(`¿Eliminar a ${p.name}?`)) delMut.mutate(p.id); }} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
