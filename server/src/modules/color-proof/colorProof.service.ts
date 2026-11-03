import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import type { ColorProof } from "../../generated/prisma/client";

// As 12 cores da Canon imagePROGRAF PRO-2600, na ordem do painel
export const INK_COLORS = ["PM", "R", "C", "PGY", "MBK", "PBK", "B", "CO", "GY", "Y", "M", "PC"] as const;
export type InkColor = (typeof INK_COLORS)[number];

// Largura do rolo de 24"
export const STANDARD_WIDTH_MM = 609.6;
// Folga para arredondamento do painel ao comparar a soma das cores com o total
const COLOR_SUM_TOLERANCE_ML = 0.05;

export interface ColorProofInput {
  date: string;
  label: string;
  isBatch?: boolean;
  paperM2: number;
  inkMl: number;
  widthMm?: number | null;
  lengthMm?: number | null;
  inkByColor?: Partial<Record<InkColor, number>> | null;
  notes?: string | null;
}

export async function getSettings() {
  return prisma.colorProofSettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

export async function updateSettings(data: { cartridgePrice: number; cartridgeMl: number; paperPricePerM2: number; maintenancePct: number }) {
  if (!(data.cartridgePrice > 0) || !(data.cartridgeMl > 0) || !(data.paperPricePerM2 >= 0) || !(data.maintenancePct >= 0)) {
    throw new HttpError(400, "Preços inválidos.");
  }
  return prisma.colorProofSettings.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Custo da prova pelas fórmulas do método validado (tinta + papel + manutenção sobre a tinta). */
export function computeCost(
  input: Pick<ColorProofInput, "paperM2" | "inkMl" | "inkByColor">,
  prices: { inkPricePerMl: number; paperPricePerM2: number; maintenancePct: number },
) {
  const inkCost = input.inkMl * prices.inkPricePerMl;
  const paperCost = input.paperM2 * prices.paperPricePerM2;
  const maintenanceCost = input.inkMl * (prices.maintenancePct / 100) * prices.inkPricePerMl;
  const totalCost = inkCost + paperCost + maintenanceCost;

  const colors = Object.entries(input.inkByColor ?? {}).filter(([, v]) => typeof v === "number" && v > 0) as [InkColor, number][];
  const colorSum = colors.reduce((s, [, v]) => s + v, 0);
  // Sem detalhe por cor não dá para conferir; com detalhe, a soma tem que bater com o total
  const colorsIncomplete = colors.length > 0 && Math.abs(colorSum - input.inkMl) > COLOR_SUM_TOLERANCE_ML;
  const top = colors.sort((a, b) => b[1] - a[1])[0];

  return {
    inkCost: round(inkCost, 2),
    paperCost: round(paperCost, 2),
    maintenanceCost: round(maintenanceCost, 2),
    totalCost: round(totalCost, 2),
    costPerM2: input.paperM2 > 0 ? round(totalCost / input.paperM2, 2) : 0,
    coverage: input.paperM2 > 0 ? round(input.inkMl / input.paperM2, 3) : 0,
    colorSum: round(colorSum, 3),
    colorsIncomplete,
    dominantColor: top ? top[0] : null,
    dominantPct: top && colorSum > 0 ? round((top[1] / colorSum) * 100, 1) : null,
  };
}

function cleanInput(raw: ColorProofInput) {
  const label = raw.label?.trim();
  const date = new Date(raw.date);
  const paperM2 = Number(raw.paperM2);
  const inkMl = Number(raw.inkMl);
  if (!label) throw new HttpError(400, "Informe a OS / cliente.");
  if (isNaN(date.getTime())) throw new HttpError(400, "Data inválida.");
  if (!(paperM2 > 0)) throw new HttpError(400, "Papel consumido (m²) deve ser maior que zero.");
  if (!(inkMl > 0)) throw new HttpError(400, "Total de tinta (ml) deve ser maior que zero.");

  const inkByColor: Partial<Record<InkColor, number>> = {};
  for (const c of INK_COLORS) {
    const v = Number(raw.inkByColor?.[c]);
    if (v > 0) inkByColor[c] = v;
  }
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) > 0 ? Number(v) : null);

  return {
    date, label, isBatch: !!raw.isBatch, paperM2, inkMl,
    widthMm: num(raw.widthMm), lengthMm: num(raw.lengthMm),
    inkByColor: Object.keys(inkByColor).length ? inkByColor : null,
    notes: raw.notes?.trim() || null,
  };
}

async function buildRecord(raw: ColorProofInput, prices?: { inkPricePerMl: number; paperPricePerM2: number; maintenancePct: number }) {
  const input = cleanInput(raw);
  if (!prices) {
    const s = await getSettings();
    prices = { inkPricePerMl: s.cartridgePrice / s.cartridgeMl, paperPricePerM2: s.paperPricePerM2, maintenancePct: s.maintenancePct };
  }
  const c = computeCost(input, prices);
  return {
    date: input.date, label: input.label, isBatch: input.isBatch,
    paperM2: input.paperM2, inkMl: input.inkMl, widthMm: input.widthMm, lengthMm: input.lengthMm,
    inkByColor: input.inkByColor ? JSON.stringify(input.inkByColor) : null,
    colorsIncomplete: c.colorsIncomplete,
    ...prices,
    inkCost: c.inkCost, paperCost: c.paperCost, maintenanceCost: c.maintenanceCost, totalCost: c.totalCost,
    dominantColor: c.dominantColor,
    notes: input.notes,
  };
}

const include = { createdBy: { select: { id: true, name: true } } } as const;

function serialize(p: ColorProof & { createdBy: { id: string; name: string } }) {
  return {
    ...p,
    inkByColor: p.inkByColor ? (JSON.parse(p.inkByColor) as Partial<Record<InkColor, number>>) : null,
    costPerM2: p.paperM2 > 0 ? round(p.totalCost / p.paperM2, 2) : 0,
    coverage: p.paperM2 > 0 ? round(p.inkMl / p.paperM2, 3) : 0,
  };
}

export async function listProofs(from?: Date, to?: Date) {
  const rows = await prisma.colorProof.findMany({
    where: from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {},
    include,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 2000,
  });
  return rows.map(serialize);
}

export async function createProof(raw: ColorProofInput, userId: string) {
  const data = await buildRecord(raw);
  return serialize(await prisma.colorProof.create({ data: { ...data, createdById: userId }, include }));
}

export async function updateProof(id: string, raw: ColorProofInput) {
  const current = await prisma.colorProof.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, "Prova não encontrada.");
  // Edição recalcula com os preços da época da prova, não com os de hoje
  const data = await buildRecord(raw, {
    inkPricePerMl: current.inkPricePerMl, paperPricePerM2: current.paperPricePerM2, maintenancePct: current.maintenancePct,
  });
  return serialize(await prisma.colorProof.update({ where: { id }, data, include }));
}

export async function deleteProof(id: string) {
  await prisma.colorProof.delete({ where: { id } }).catch(() => { throw new HttpError(404, "Prova não encontrada."); });
}
