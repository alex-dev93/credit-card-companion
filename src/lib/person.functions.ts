import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Detailed breakdown of what a single person owes, grouped by card and period.
export const getPersonBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ person_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: person, error: pErr } = await supabase
      .from("people")
      .select("id, name, phone, color")
      .eq("id", data.person_id)
      .single();
    if (pErr || !person) throw new Error("Persona no encontrada");

    const { data: assignments } = await supabase
      .from("purchase_assignments")
      .select(`
        id, share_amount, purchase_id,
        purchases:purchase_id (
          id, merchant, posted_at, installment_amount, current_installment, total_installments,
          card_id, statement_id,
          cards:card_id ( id, alias, bank, last4, color, credit_limit, cut_day, payment_day, min_payment, no_interest_payment ),
          statements:statement_id ( period )
        )
      `)
      .eq("person_id", data.person_id);

    type Row = NonNullable<typeof assignments>[number];
    type Card = {
      id: string; alias: string; bank: string; last4: string | null; color: string;
      credit_limit: number | null; cut_day: number | null; payment_day: number | null;
      min_payment: number | null; no_interest_payment: number | null;
    };

    const byCard = new Map<string, {
      card: Card;
      totalMonth: number;
      totalRemaining: number;
      items: Array<{
        purchase_id: string;
        merchant: string;
        posted_at: string | null;
        period: string;
        installment_amount: number;
        share_amount: number;
        current_installment: number;
        total_installments: number;
        remaining_installments: number;
        remaining_amount: number;
      }>;
    }>();

    let totalMonth = 0;
    let totalRemaining = 0;

    for (const a of (assignments ?? []) as Row[]) {
      const p: any = a.purchases;
      if (!p) continue;
      const card: Card = p.cards;
      if (!card) continue;
      const share = Number(a.share_amount);
      const installmentAmt = Number(p.installment_amount);
      const ratio = installmentAmt > 0 ? share / installmentAmt : 0;
      const remainingInst = Math.max(0, p.total_installments - p.current_installment);
      const remainingAmt = +(ratio * installmentAmt * remainingInst).toFixed(2);

      totalMonth += share;
      totalRemaining += share + remainingAmt;

      const slot = byCard.get(card.id) ?? { card, totalMonth: 0, totalRemaining: 0, items: [] };
      slot.totalMonth += share;
      slot.totalRemaining += share + remainingAmt;
      slot.items.push({
        purchase_id: p.id,
        merchant: p.merchant,
        posted_at: p.posted_at,
        period: p.statements?.period ?? "—",
        installment_amount: installmentAmt,
        share_amount: share,
        current_installment: p.current_installment,
        total_installments: p.total_installments,
        remaining_installments: remainingInst,
        remaining_amount: remainingAmt,
      });
      byCard.set(card.id, slot);
    }

    return {
      person,
      totalMonth: +totalMonth.toFixed(2),
      totalRemaining: +totalRemaining.toFixed(2),
      cards: Array.from(byCard.values()).map((g) => ({
        ...g,
        totalMonth: +g.totalMonth.toFixed(2),
        totalRemaining: +g.totalRemaining.toFixed(2),
      })),
    };
  });

// Generate a PDF with the person's breakdown. Returns base64 + filename.
export const generatePersonPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ person_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Reuse breakdown logic by calling the same function in-process.
    const { data: person } = await supabase
      .from("people").select("id, name, phone").eq("id", data.person_id).single();
    if (!person) throw new Error("Persona no encontrada");

    const { data: assignments } = await supabase
      .from("purchase_assignments")
      .select(`
        share_amount,
        purchases:purchase_id (
          merchant, posted_at, installment_amount, current_installment, total_installments,
          cards:card_id ( alias, bank, last4, payment_day ),
          statements:statement_id ( period )
        )
      `)
      .eq("person_id", data.person_id);

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page = pdf.addPage([612, 792]);
    let y = 750;
    const drawText = (text: string, x: number, size = 10, isBold = false, color = rgb(0, 0, 0)) => {
      page.drawText(text, { x, y, size, font: isBold ? bold : font, color });
    };
    const line = (height = 14) => {
      y -= height;
      if (y < 50) {
        page = pdf.addPage([612, 792]);
        y = 750;
      }
    };
    const fmt = (n: number) => "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    drawText(`Desglose de ${person.name}`, 50, 20, true);
    line(24);
    drawText(`Generado: ${new Date().toLocaleString("es-MX")}`, 50, 9, false, rgb(0.4, 0.4, 0.4));
    line(24);

    // Group by card
    type Item = { merchant: string; period: string; share: number; current: number; total: number; remaining: number; remAmt: number; payDay: number | null; cardLabel: string };
    const groups = new Map<string, Item[]>();
    let grandMonth = 0;
    let grandRemaining = 0;
    for (const a of (assignments ?? []) as any[]) {
      const p = a.purchases; if (!p) continue;
      const c = p.cards; if (!c) continue;
      const label = `${c.bank} · ${c.alias} (••${c.last4 ?? "··"})`;
      const share = Number(a.share_amount);
      const inst = Number(p.installment_amount);
      const ratio = inst > 0 ? share / inst : 0;
      const remInst = Math.max(0, p.total_installments - p.current_installment);
      const remAmt = +(ratio * inst * remInst).toFixed(2);
      grandMonth += share;
      grandRemaining += share + remAmt;
      const arr = groups.get(label) ?? [];
      arr.push({
        merchant: p.merchant,
        period: p.statements?.period ?? "—",
        share, current: p.current_installment, total: p.total_installments,
        remaining: remInst, remAmt, payDay: c.payment_day ?? null, cardLabel: label,
      });
      groups.set(label, arr);
    }

    drawText(`Total de este mes: ${fmt(grandMonth)}`, 50, 12, true);
    line();
    drawText(`Total pendiente (incluye meses futuros): ${fmt(grandRemaining)}`, 50, 11);
    line(24);

    if (groups.size === 0) {
      drawText("Sin compras asignadas todavía.", 50, 11, false, rgb(0.5, 0.5, 0.5));
    }

    for (const [label, items] of groups) {
      const payDay = items[0].payDay;
      drawText(label, 50, 12, true, rgb(0.1, 0.1, 0.4));
      line();
      if (payDay) {
        drawText(`Día de pago: ${payDay} de cada mes`, 50, 9, false, rgb(0.4, 0.4, 0.4));
        line();
      }
      // table headers
      drawText("Compra", 50, 9, true);
      drawText("Periodo", 260, 9, true);
      drawText("Mes", 330, 9, true);
      drawText("MSI", 400, 9, true);
      drawText("Pendiente", 470, 9, true);
      line(12);
      let cardMonth = 0;
      let cardRemaining = 0;
      for (const it of items) {
        drawText(it.merchant.slice(0, 32), 50, 9);
        drawText(it.period, 260, 9);
        drawText(fmt(it.share), 330, 9);
        drawText(it.total > 1 ? `${it.current}/${it.total}` : "—", 400, 9);
        drawText(it.remAmt > 0 ? fmt(it.remAmt) : "—", 470, 9);
        cardMonth += it.share;
        cardRemaining += it.share + it.remAmt;
        line(12);
      }
      drawText(`Subtotal mes: ${fmt(cardMonth)}  ·  Pendiente total: ${fmt(cardRemaining)}`, 50, 9, true, rgb(0.2, 0.2, 0.2));
      line(20);
    }

    const bytes = await pdf.save();
    const b64 = Buffer.from(bytes).toString("base64");
    return {
      filename: `desglose-${person.name.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.pdf`,
      base64: b64,
    };
  });
