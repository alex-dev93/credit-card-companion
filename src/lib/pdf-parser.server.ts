// PDF parsing helpers — server only
import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractedPurchase {
  posted_at: string | null; // YYYY-MM-DD or null
  merchant: string;
  amount: number; // total of the purchase
  installment_amount: number; // amount charged this month
  current_installment: number;
  total_installments: number;
}

// Normalize merchant name for signature matching
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

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

// Heuristic parser that handles most Mexican bank statements (Banamex, BBVA, Banorte, Santander, etc.).
// Looks for lines that contain a date, a merchant, a peso amount, and optionally MSI info.
export function parseStatementText(rawText: string): ExtractedPurchase[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const purchases: ExtractedPurchase[] = [];

  // Patterns
  const dateRe = /\b(\d{1,2})[\s/-](ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC|JAN|APR|AUG|DEC)[\s/-]?(\d{2,4})?\b/i;
  const dateNumRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
  const amountRe = /\$?\s?(-?\d{1,3}(?:,\d{3})*\.\d{2})\b/g;
  const msiRe = /(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:MSI|MESES|PAGOS|M\.?S\.?I\.?)?/i;
  const msiPlanRe = /(?:MSI|MENSUALIDADES?|PAGO)\s*(\d{1,2})\s*(?:DE|\/)\s*(\d{1,2})/i;

  const monthMap: Record<string, string> = {
    ENE: "01", JAN: "01", FEB: "02", MAR: "03", ABR: "04", APR: "04",
    MAY: "05", JUN: "06", JUL: "07", AGO: "08", AUG: "08",
    SEP: "09", OCT: "10", NOV: "11", DIC: "12", DEC: "12",
  };

  for (const line of lines) {
    // Need at least one amount
    const amounts = [...line.matchAll(amountRe)].map((m) => parseFloat(m[1].replace(/,/g, "")));
    if (amounts.length === 0) continue;

    // Skip totals/payments/interest lines
    if (/\b(PAGO|INTERES|COMISION|IVA|SALDO|TOTAL|LIMITE|CORTE|ABONO)\b/i.test(line)) continue;

    // Need a date
    let posted_at: string | null = null;
    const dm = line.match(dateRe);
    const dnm = line.match(dateNumRe);
    const now = new Date();
    if (dm) {
      const day = dm[1].padStart(2, "0");
      const mon = monthMap[dm[2].toUpperCase()] || "01";
      const year = dm[3] ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : String(now.getFullYear());
      posted_at = `${year}-${mon}-${day}`;
    } else if (dnm) {
      const day = dnm[1].padStart(2, "0");
      const mon = dnm[2].padStart(2, "0");
      const year = dnm[3].length === 2 ? `20${dnm[3]}` : dnm[3];
      posted_at = `${year}-${mon}-${day}`;
    } else {
      continue;
    }

    // MSI detection
    let current_installment = 1;
    let total_installments = 1;
    const msi = line.match(msiPlanRe) || line.match(msiRe);
    if (msi) {
      const a = parseInt(msi[1], 10);
      const b = parseInt(msi[2], 10);
      if (a > 0 && b > 0 && a <= b && b <= 60) {
        current_installment = a;
        total_installments = b;
      }
    }

    // Last amount on the line is usually the charge for this month
    const installment_amount = amounts[amounts.length - 1];
    if (installment_amount <= 0) continue;

    const amount = total_installments > 1
      ? +(installment_amount * total_installments).toFixed(2)
      : installment_amount;

    // Extract merchant — strip date, amounts, MSI fragments
    let merchant = line
      .replace(dateRe, "")
      .replace(dateNumRe, "")
      .replace(msiPlanRe, "")
      .replace(msiRe, "")
      .replace(amountRe, "")
      .replace(/\$\s?/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Trim leading/trailing punctuation
    merchant = merchant.replace(/^[\s\-\.|,]+|[\s\-\.|,]+$/g, "").trim();
    if (!merchant || merchant.length < 2) continue;

    // Truncate very long
    if (merchant.length > 80) merchant = merchant.slice(0, 80);

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
