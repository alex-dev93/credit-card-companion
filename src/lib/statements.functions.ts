import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractTextFromPdf, parseStatementText, buildSignature, extractCardLast4Candidates } from "./pdf-parser.server";

// Upload + parse a statement PDF (base64-encoded for transport)
export const uploadAndParseStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      card_id: z.string().uuid(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
      pdf_base64: z.string().min(10),
      filename: z.string().max(200),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Verify card belongs to user
    const { data: card, error: cardErr } = await supabase
      .from("cards")
      .select("id, last4")
      .eq("id", data.card_id)
      .single();
    if (cardErr || !card) throw new Error("Tarjeta no encontrada");

    // 2. Decode PDF (keep two independent copies — Supabase storage upload may
    // transfer/detach the underlying ArrayBuffer, which would break the parser).
    const binary = Uint8Array.from(atob(data.pdf_base64), (c) => c.charCodeAt(0));
    const forParse = new Uint8Array(binary); // independent copy for unpdf
    const forUpload = new Uint8Array(binary); // independent copy for storage

    // 3. Extract text first so we can validate the selected card before saving anything
    const text = await extractTextFromPdf(forParse.buffer as ArrayBuffer);
    const cardDigits = extractCardLast4Candidates(text);
    const expectedLast4 = card.last4?.replace(/\D/g, "");
    if (expectedLast4?.length === 4 && cardDigits.length > 0 && !cardDigits.includes(expectedLast4)) {
      throw new Error(`Este PDF parece ser de una tarjeta terminada en ${cardDigits.join(" o ")}, pero seleccionaste la tarjeta terminada en ${expectedLast4}. Elige la tarjeta correcta antes de subirlo.`);
    }

    // 4. Upload to storage
    const path = `${userId}/${data.card_id}/${data.period}-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("statements")
      .upload(path, forUpload, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`No se pudo subir el PDF: ${upErr.message}`);

    // 5. Create statement record (upsert by card+period)
    const { data: existing } = await supabase
      .from("statements")
      .select("id")
      .eq("card_id", data.card_id)
      .eq("period", data.period)
      .maybeSingle();

    let statementId: string;
    if (existing) {
      // Replace: delete old purchases and update path
      await supabase.from("purchases").delete().eq("statement_id", existing.id);
      await supabase
        .from("statements")
        .update({ pdf_path: path, parsed_at: new Date().toISOString() })
        .eq("id", existing.id);
      statementId = existing.id;
    } else {
      const { data: st, error: stErr } = await supabase
        .from("statements")
        .insert({
          user_id: userId,
          card_id: data.card_id,
          period: data.period,
          pdf_path: path,
          parsed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (stErr || !st) throw new Error(`No se pudo crear el estado de cuenta: ${stErr?.message}`);
      statementId = st.id;
    }

    // 6. Parse purchases
    const extracted = parseStatementText(text);

    if (extracted.length === 0) {
      return { statementId, parsed: 0, autoAssigned: 0, pending: 0, warning: "No se detectaron compras en el PDF. Puedes revisar el formato o capturarlas manualmente." };
    }

    // 7. Load existing rules for this card
    const { data: rules } = await supabase
      .from("merchant_rules")
      .select("signature, assignments")
      .eq("card_id", data.card_id);
    const ruleMap = new Map((rules ?? []).map((r) => [r.signature, r.assignments as Array<{ person_id: string; percent: number }>]));

    // 8. Insert purchases
    let autoAssigned = 0;
    let pending = 0;
    const purchaseRows = extracted.map((p) => {
      const signature = buildSignature(p);
      const hasRule = ruleMap.has(signature);
      if (hasRule) autoAssigned++;
      else pending++;
      return {
        user_id: userId,
        card_id: data.card_id,
        statement_id: statementId,
        posted_at: p.posted_at,
        merchant: p.merchant,
        amount: p.amount,
        installment_amount: p.installment_amount,
        current_installment: p.current_installment,
        total_installments: p.total_installments,
        signature,
        assignment_status: hasRule ? "assigned" : "pending",
      };
    });

    const { data: insertedPurchases, error: purErr } = await supabase
      .from("purchases")
      .insert(purchaseRows)
      .select("id, signature, installment_amount");
    if (purErr) throw new Error(`No se pudieron guardar las compras: ${purErr.message}`);

    // 9. Apply rules → create assignments for matched purchases
    const assignmentRows: Array<{
      user_id: string;
      purchase_id: string;
      person_id: string;
      share_amount: number;
    }> = [];
    for (const pur of insertedPurchases ?? []) {
      const rule = ruleMap.get(pur.signature);
      if (!rule) continue;
      for (const r of rule) {
        assignmentRows.push({
          user_id: userId,
          purchase_id: pur.id,
          person_id: r.person_id,
          share_amount: +(Number(pur.installment_amount) * (r.percent / 100)).toFixed(2),
        });
      }
    }
    if (assignmentRows.length > 0) {
      await supabase.from("purchase_assignments").insert(assignmentRows);
    }

    return {
      statementId,
      parsed: extracted.length,
      autoAssigned,
      pending,
    };
  });

export const listStatements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ card_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("statements")
      .select("id, period, pdf_path, parsed_at, created_at")
      .eq("card_id", data.card_id)
      .order("period", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ statement_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: st } = await supabase
      .from("statements")
      .select("pdf_path")
      .eq("id", data.statement_id)
      .single();
    if (st?.pdf_path) {
      await supabase.storage.from("statements").remove([st.pdf_path]);
    }
    const { error } = await supabase.from("statements").delete().eq("id", data.statement_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
