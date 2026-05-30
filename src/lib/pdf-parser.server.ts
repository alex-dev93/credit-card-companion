// PDF parsing helpers — server only
import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractedPurchase {
  posted_at: string | null;
  merchant: string;
  amount: number;
  installment_amount: number;
  current_installment: number;
  total_installments: number;
}

export function normalizeMerchant(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9 ]/g, "")
    .trim();
}

export function buildSignature(p: { merchant: string; amount: number; total_installments: number }): string {
  return `${normalizeMerchant(p.merchant)}|${p.amount.toFixed(2)}|${p.total_installments}`;
}

export function extractCardLast4Candidates(rawText: string): string[] {
  const text = rawText.replace(/\s+/g, " ").trim();
  const candidates = new Set<string>();
  const maskedRe = /(?:TARJETA|CARD|CUENTA|N[ÚU]MERO|NO\.?|CTA\.?)\D{0,45}(?:[Xx*•·]{2,}|\d{4}[\s-]*\d{2,6}[\s-]*)[\s-]*(\d{4})\b/gi;
  const plainRe = /(?:TARJETA|CARD|CUENTA|N[ÚU]MERO|NO\.?|CTA\.?)\D{0,45}(\d[\d\s-]{11,22}\d)/gi;
  const last4Re = /(?:TARJETA|CARD|CUENTA|N[ÚU]MERO|NO\.?|CTA\.?|TERMINACI[OÓ]N|TERMINA|[ÚU]LTIMOS)\D{0,60}(\d{4})\b/gi;
  let match: RegExpExecArray | null;

  while ((match = maskedRe.exec(text)) !== null) {
    candidates.add(match[1]);
  }

  while ((match = last4Re.exec(text)) !== null) {
    candidates.add(match[1]);
  }

  while ((match = plainRe.exec(text)) !== null) {
    const digits = match[1].replace(/\D/g, "");
    if (digits.length >= 12 && digits.length <= 19) candidates.add(digits.slice(-4));
  }

  return Array.from(candidates);
}

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

const MONTHS: Record<string, string> = {
  ENERO: "01", ENE: "01", JAN: "01",
  FEBRERO: "02", FEB: "02",
  MARZO: "03", MAR: "03",
  ABRIL: "04", ABR: "04", APR: "04",
  MAYO: "05", MAY: "05",
  JUNIO: "06", JUN: "06",
  JULIO: "07", JUL: "07",
  AGOSTO: "08", AGO: "08", AUG: "08",
  SEPTIEMBRE: "09", SEP: "09", SET: "09",
  OCTUBRE: "10", OCT: "10",
  NOVIEMBRE: "11", NOV: "11",
  DICIEMBRE: "12", DIC: "12", DEC: "12",
};

const MONTH_RE_SRC = "(?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre|Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)";

// Robust parser for Mexican bank statements (AmEx, Banamex, BBVA, etc.)
// Strategy: locate date anchors "DD de Mes" in the whole text, then slice between them.
export function parseStatementText(rawText: string): ExtractedPurchase[] {
  // Normalize whitespace
  const text = rawText.replace(/\s+/g, " ").trim();

  const dateAnchorRe = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTH_RE_SRC})\\b`, "gi");
  const matches: Array<{ idx: number; day: string; month: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = dateAnchorRe.exec(text)) !== null) {
    matches.push({ idx: m.index, day: m[1], month: m[2] });
  }

  const purchases: ExtractedPurchase[] = [];
  const seen = new Set<string>();
  const year = new Date().getFullYear();

  // Collect "MONTO A DIFERIR MESES EN AUTOMATICO" CR amounts (AmEx Pagos Diferidos auto-conversion).
  // These credits offset contado purchases that were auto-converted to MSI (typically 3 months).
  const diferirAmounts: number[] = [];
  const diferirRe = /MONTO\s+A\s+DIFERIR[^0-9]{0,80}(\d{1,3}(?:,\d{3})*\.\d{2})\s*CR/gi;
  let dm: RegExpExecArray | null;
  while ((dm = diferirRe.exec(text)) !== null) {
    diferirAmounts.push(parseFloat(dm[1].replace(/,/g, "")));
  }
  // Try to detect the number of months (e.g. "DIFERIDO A 3 MESES"); default to 3 (AmEx standard).
  const monthsMatch = text.match(/DIFERIDO\s+A\s+(\d{1,2})\s+MESES/i) || text.match(/(\d{1,2})\s+MESES\s+EN\s+AUTOM[ÁA]TICO/i);
  const diferirMonths = monthsMatch ? Math.max(2, Math.min(60, parseInt(monthsMatch[1], 10))) : 3;

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : text.length;
    const chunk = text.slice(start, end).trim();

    // Skip non-transaction chunks (payments, totals, headers)
    if (/GRACIAS POR SU PAGO|PAGO RECIBIDO|MONTO A DIFERIR|TOTAL DE|SALDO ANTERIOR|FECHA L[IÍ]MITE|PERIODO DE FACTURACI[OÓ]N|PER[IÍ]ODO DE|FECHA DE CORTE|SIGUIENTE FECHA|D[IÍ]AS DEL PERIODO/i.test(chunk)) continue;

    // Find amounts in chunk
    const amountRe = /(\d{1,3}(?:,\d{3})*\.\d{2})/g;
    const amts: Array<{ value: number; idx: number; end: number }> = [];
    let am: RegExpExecArray | null;
    while ((am = amountRe.exec(chunk)) !== null) {
      amts.push({ value: parseFloat(am[1].replace(/,/g, "")), idx: am.index, end: am.index + am[0].length });
    }
    if (amts.length === 0) continue;

    // Use the LAST amount as the charge for this transaction
    const last = amts[amts.length - 1];

    // If immediately followed by "CR" → it's a credit (payment/refund), skip
    const after = chunk.slice(last.end, last.end + 6);
    if (/^\s*CR\b/i.test(after)) continue;

    // MSI detection: "CARGO X DE Y" or "X/Y MSI" or "X DE Y"
    let current_installment = 1;
    let total_installments = 1;
    const cargo = chunk.match(/CARGO\s+(\d{1,2})\s+DE\s+(\d{1,2})/i)
      || chunk.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:MSI|MESES|PAGOS)/i)
      || chunk.match(/MENSUALIDAD\s+(\d{1,2})\s+DE\s+(\d{1,2})/i);
    if (cargo) {
      const a = parseInt(cargo[1], 10);
      const b = parseInt(cargo[2], 10);
      if (a > 0 && b > 0 && a <= b && b <= 60) {
        current_installment = a;
        total_installments = b;
      }
    }

    const installment_amount = last.value;
    if (installment_amount <= 0) continue;
    const amount = total_installments > 1 ? +(installment_amount * total_installments).toFixed(2) : installment_amount;

    // Extract merchant: text between date and first amount, stripping noise
    const dateEnd = chunk.search(new RegExp(`\\d{1,2}\\s+de\\s+${MONTH_RE_SRC}`, "i"));
    const firstAmt = amts[0];
    let merchant = chunk.slice(0, firstAmt.idx).trim();
    // Drop the leading "DD de Mes" portion (may repeat several times in some PDFs)
    merchant = merchant.replace(new RegExp(`^(?:\\d{1,2}\\s+de\\s+${MONTH_RE_SRC}\\s*)+`, "i"), "").trim();
    // Strip MSI/cargo fragments, RFC, REF, trailing punctuation
    merchant = merchant
      .replace(/CARGO\s+\d{1,2}\s+DE\s+\d{1,2}/gi, "")
      .replace(/MENSUALIDAD\s+\d{1,2}\s+DE\s+\d{1,2}/gi, "")
      .replace(/\d{1,2}\s*\/\s*\d{1,2}\s*(?:MSI|MESES|PAGOS)/gi, "")
      .replace(/RFC[A-Z0-9]+/gi, "")
      .replace(/\/?\s*REF\S+/gi, "")
      .replace(/\$\s?/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s\-\.|,]+|[\s\-\.|,]+$/g, "")
      .trim();

    if (!merchant || merchant.length < 2) continue;
    if (merchant.length > 80) merchant = merchant.slice(0, 80);

    // Skip obvious non-merchants
    if (/^(SALDO|TOTAL|PAGO|ABONO|INTERES|COMISI|IVA|LIMITE)/i.test(merchant)) continue;

    const day = matches[i].day.padStart(2, "0");
    const mon = MONTHS[matches[i].month.toUpperCase()] || "01";
    const posted_at = `${year}-${mon}-${day}`;

    // Dedup (same chunk may be processed twice if regexes overlap)
    const key = `${posted_at}|${normalizeMerchant(merchant)}|${installment_amount}|${total_installments}`;
    if (seen.has(key)) continue;
    seen.add(key);

    purchases.push({
      posted_at,
      merchant,
      amount,
      installment_amount,
      current_installment,
      total_installments,
    });
  }

  return purchases;
}
