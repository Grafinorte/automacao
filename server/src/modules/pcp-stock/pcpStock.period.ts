// Tudo no horário de Brasília (sem horário de verão desde 2019), seja qual for o fuso do servidor
const TIME_ZONE = "America/Sao_Paulo";
const OFFSET = "-03:00";
const SEND_HOUR = 8;

export const isPeriod = (p: unknown): p is string => typeof p === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

function localParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

const toPeriod = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

export function previousPeriod(now: Date) {
  const { year, month } = localParts(now);
  return month === 1 ? toPeriod(year - 1, 12) : toPeriod(year, month - 1);
}

export function currentPeriod(now: Date) {
  const { year, month } = localParts(now);
  return toPeriod(year, month);
}

export function monthRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const next = month === 12 ? toPeriod(year + 1, 1) : toPeriod(year, month + 1);
  return { start: new Date(`${period}-01T00:00:00${OFFSET}`), end: new Date(`${next}-01T00:00:00${OFFSET}`) };
}

/** Mês a enviar agora, ou null. Se o servidor estava desligado no dia 1º, envia assim que voltar. */
export function duePeriod(now: Date, lastPeriodSent: string | null) {
  const { day, hour } = localParts(now);
  if (day === 1 && hour < SEND_HOUR) return null;
  const previous = previousPeriod(now);
  return lastPeriodSent && lastPeriodSent >= previous ? null : previous;
}

export function formatPeriod(period: string) {
  return monthRange(period).start.toLocaleDateString("pt-BR", { timeZone: TIME_ZONE, month: "long", year: "numeric" });
}

export const formatDateTime = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const formatDate = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: TIME_ZONE });
