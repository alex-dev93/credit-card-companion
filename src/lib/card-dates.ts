// Helpers para calcular próximas fechas de corte y pago de una tarjeta.
// Pure JS — safe para client y server.

export function nextDateForDay(day: number, from: Date = new Date()): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  // Use last day of month if day > days in month
  const lastDay = new Date(y, m + 1, 0).getDate();
  const useDay = Math.min(day, lastDay);
  let candidate = new Date(y, m, useDay);
  candidate.setHours(0, 0, 0, 0);
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  if (candidate < today) {
    const nm = m + 1;
    const nLast = new Date(y, nm + 1, 0).getDate();
    candidate = new Date(y, nm, Math.min(day, nLast));
  }
  return candidate;
}

export function daysUntil(date: Date, from: Date = new Date()): number {
  const a = new Date(date); a.setHours(0, 0, 0, 0);
  const b = new Date(from); b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}
