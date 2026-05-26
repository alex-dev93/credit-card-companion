import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Get pending purchases for a card+period (or statement)
export const listPendingPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ statement_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("purchases")
      .select("id, merchant, amount, installment_amount, current_installment, total_installments, posted_at, signature, assignment_status")
      .eq("statement_id", data.statement_id)
      .order("posted_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const assignmentSchema = z.object({
  purchase_id: z.string().uuid(),
  // assignments: array of { person_id, percent }. If empty → "mio" (no debt to anyone)
  assignments: z.array(z.object({
    person_id: z.string().uuid(),
    percent: z.number().min(0.01).max(100),
  })),
  remember: z.boolean().default(true),
});

export const assignPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => assignmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load purchase
    const { data: pur, error: purErr } = await supabase
      .from("purchases")
      .select("id, card_id, installment_amount, signature")
      .eq("id", data.purchase_id)
      .single();
    if (purErr || !pur) throw new Error("Compra no encontrada");

    // Validate percent sum (if any) ≤ 100
    const sumPct = data.assignments.reduce((s, a) => s + a.percent, 0);
    if (data.assignments.length > 0 && sumPct > 100.01) {
      throw new Error("Los porcentajes no pueden sumar más de 100%");
    }

    // Wipe previous assignments
    await supabase.from("purchase_assignments").delete().eq("purchase_id", data.purchase_id);

    // Insert new
    if (data.assignments.length > 0) {
      const rows = data.assignments.map((a) => ({
        user_id: userId,
        purchase_id: data.purchase_id,
        person_id: a.person_id,
        share_amount: +(Number(pur.installment_amount) * (a.percent / 100)).toFixed(2),
      }));
      const { error: aErr } = await supabase.from("purchase_assignments").insert(rows);
      if (aErr) throw new Error(aErr.message);
    }

    // Update status
    await supabase
      .from("purchases")
      .update({ assignment_status: data.assignments.length > 0 ? "assigned" : "mine" })
      .eq("id", data.purchase_id);

    // Remember rule for next month
    if (data.remember) {
      await supabase
        .from("merchant_rules")
        .upsert(
          {
            user_id: userId,
            card_id: pur.card_id,
            signature: pur.signature,
            assignments: data.assignments,
          },
          { onConflict: "card_id,signature" }
        );
    }

    return { ok: true };
  });

// Monthly breakdown by person for a given card+period
export const getMonthBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      card_id: z.string().uuid().optional(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Find statements for the period
    let stmtQ = supabase.from("statements").select("id, card_id").eq("period", data.period);
    if (data.card_id) stmtQ = stmtQ.eq("card_id", data.card_id);
    const { data: stmts } = await stmtQ;
    const stmtIds = (stmts ?? []).map((s) => s.id);
    if (stmtIds.length === 0) {
      return { total: 0, perPerson: [], mine: 0, pending: 0, purchases: [] };
    }

    const { data: purchases } = await supabase
      .from("purchases")
      .select("id, merchant, installment_amount, current_installment, total_installments, assignment_status, card_id, statement_id, posted_at")
      .in("statement_id", stmtIds);

    const purIds = (purchases ?? []).map((p) => p.id);
    const { data: assignments } = await supabase
      .from("purchase_assignments")
      .select("purchase_id, person_id, share_amount, people:person_id(name, color)")
      .in("purchase_id", purIds.length > 0 ? purIds : ["00000000-0000-0000-0000-000000000000"]);

    const perPersonMap = new Map<string, { person_id: string; name: string; color: string; total: number; count: number }>();
    let mine = 0;
    let pending = 0;
    let total = 0;

    const assignmentsByPurchase = new Map<string, typeof assignments>();
    for (const a of assignments ?? []) {
      const arr = assignmentsByPurchase.get(a.purchase_id) ?? [];
      arr.push(a);
      assignmentsByPurchase.set(a.purchase_id, arr);
    }

    for (const p of purchases ?? []) {
      const charge = Number(p.installment_amount);
      total += charge;
      const asg = assignmentsByPurchase.get(p.id) ?? [];
      const assignedSum = asg.reduce((s, a) => s + Number(a.share_amount), 0);

      if (p.assignment_status === "pending") {
        pending += charge;
      } else {
        // Whatever wasn't assigned is mine
        mine += Math.max(0, charge - assignedSum);
      }

      for (const a of asg) {
        const existing = perPersonMap.get(a.person_id) ?? {
          person_id: a.person_id,
          name: (a as any).people?.name ?? "—",
          color: (a as any).people?.color ?? "#10b981",
          total: 0,
          count: 0,
        };
        existing.total += Number(a.share_amount);
        existing.count += 1;
        perPersonMap.set(a.person_id, existing);
      }
    }

    return {
      total: +total.toFixed(2),
      mine: +mine.toFixed(2),
      pending: +pending.toFixed(2),
      perPerson: Array.from(perPersonMap.values()).sort((a, b) => b.total - a.total),
      purchases: (purchases ?? []).map((p) => ({
        ...p,
        installment_amount: Number(p.installment_amount),
        assignments: (assignmentsByPurchase.get(p.id) ?? []).map((a) => ({
          person_id: a.person_id,
          person_name: (a as any).people?.name ?? "—",
          person_color: (a as any).people?.color ?? "#10b981",
          share_amount: Number(a.share_amount),
        })),
      })),
    };
  });

// Aggregate: how much does each person owe me right now (current period across all cards)
export const getPersonTotals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: stmts } = await supabase.from("statements").select("id").eq("period", data.period);
    const stmtIds = (stmts ?? []).map((s) => s.id);
    if (stmtIds.length === 0) return [];

    const { data: purs } = await supabase
      .from("purchases")
      .select("id")
      .in("statement_id", stmtIds);
    const purIds = (purs ?? []).map((p) => p.id);
    if (purIds.length === 0) return [];

    const { data: assignments } = await supabase
      .from("purchase_assignments")
      .select("person_id, share_amount, people:person_id(name, color)")
      .in("purchase_id", purIds);

    const map = new Map<string, { person_id: string; name: string; color: string; total: number }>();
    for (const a of assignments ?? []) {
      const ex = map.get(a.person_id) ?? {
        person_id: a.person_id,
        name: (a as any).people?.name ?? "—",
        color: (a as any).people?.color ?? "#10b981",
        total: 0,
      };
      ex.total += Number(a.share_amount);
      map.set(a.person_id, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  });
