import { api } from "./client";

// As 12 cores da Canon imagePROGRAF PRO-2600, na ordem do painel
export const INK_COLORS = ["PM", "R", "C", "PGY", "MBK", "PBK", "B", "CO", "GY", "Y", "M", "PC"] as const;
export type InkColor = (typeof INK_COLORS)[number];

export const INK_INFO: Record<InkColor, { name: string; swatch: string }> = {
  PM:  { name: "Magenta foto",        swatch: "#e86aa6" },
  R:   { name: "Vermelho",            swatch: "#d92b2b" },
  C:   { name: "Ciano",               swatch: "#00a0dc" },
  PGY: { name: "Cinza foto",          swatch: "#a3a8b0" },
  MBK: { name: "Preto fosco",         swatch: "#3a3a3a" },
  PBK: { name: "Preto foto",          swatch: "#111111" },
  B:   { name: "Azul",                swatch: "#2453c7" },
  CO:  { name: "Otimizador de croma", swatch: "#cfd6df" },
  GY:  { name: "Cinza",               swatch: "#6b7280" },
  Y:   { name: "Amarelo",             swatch: "#f2c200" },
  M:   { name: "Magenta",             swatch: "#d10a7d" },
  PC:  { name: "Ciano foto",          swatch: "#5cc6ea" },
};

export const STANDARD_WIDTH_MM = 609.6;

export interface ColorProof {
  id: string;
  date: string;
  label: string;
  isBatch: boolean;
  paperM2: number;
  inkMl: number;
  widthMm: number | null;
  lengthMm: number | null;
  inkByColor: Partial<Record<InkColor, number>> | null;
  colorsIncomplete: boolean;
  inkPricePerMl: number;
  paperPricePerM2: number;
  maintenancePct: number;
  inkCost: number;
  paperCost: number;
  maintenanceCost: number;
  totalCost: number;
  costPerM2: number;
  coverage: number;
  dominantColor: InkColor | null;
  notes: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
}

export interface ColorProofSettings {
  cartridgePrice: number;
  cartridgeMl: number;
  paperPricePerM2: number;
  maintenancePct: number;
  updatedAt: string;
}

export interface ColorProofInput {
  date: string;
  label: string;
  isBatch: boolean;
  paperM2: number;
  inkMl: number;
  widthMm: number | null;
  lengthMm: number | null;
  inkByColor: Partial<Record<InkColor, number>> | null;
  notes: string | null;
}

export const colorProofApi = {
  list: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return api.get<ColorProof[]>(`/teste-cor${q.toString() ? `?${q}` : ""}`);
  },
  create: (data: ColorProofInput) => api.post<ColorProof>("/teste-cor", data),
  update: (id: string, data: ColorProofInput) => api.put<ColorProof>(`/teste-cor/${id}`, data),
  remove: (id: string) => api.delete<void>(`/teste-cor/${id}`),
  getSettings: () => api.get<ColorProofSettings>("/teste-cor/settings"),
  saveSettings: (data: Omit<ColorProofSettings, "updatedAt">) => api.put<ColorProofSettings>("/teste-cor/settings", data),
};

/** Mesmas fórmulas do servidor — usadas para mostrar o custo enquanto o operador digita. */
export function computeCost(
  input: { paperM2: number; inkMl: number; inkByColor?: Partial<Record<InkColor, number>> | null },
  prices: { inkPricePerMl: number; paperPricePerM2: number; maintenancePct: number },
) {
  const inkCost = input.inkMl * prices.inkPricePerMl;
  const paperCost = input.paperM2 * prices.paperPricePerM2;
  const maintenanceCost = input.inkMl * (prices.maintenancePct / 100) * prices.inkPricePerMl;
  const totalCost = inkCost + paperCost + maintenanceCost;
  const colors = Object.entries(input.inkByColor ?? {}).filter(([, v]) => typeof v === "number" && v > 0) as [InkColor, number][];
  const colorSum = colors.reduce((s, [, v]) => s + v, 0);
  const top = [...colors].sort((a, b) => b[1] - a[1])[0];
  return {
    inkCost, paperCost, maintenanceCost, totalCost,
    costPerM2: input.paperM2 > 0 ? totalCost / input.paperM2 : 0,
    coverage: input.paperM2 > 0 ? input.inkMl / input.paperM2 : 0,
    colorSum,
    hasColors: colors.length > 0,
    colorsIncomplete: colors.length > 0 && Math.abs(colorSum - input.inkMl) > 0.05,
    dominantColor: top ? top[0] : null,
    dominantPct: top && colorSum > 0 ? (top[1] / colorSum) * 100 : null,
  };
}

/** Faixas de referência das provas medidas (só para conferência, não para cobrar). */
export function coverageBand(coverage: number): { label: string; tone: "ok" | "warn" } {
  if (coverage <= 0) return { label: "—", tone: "ok" };
  if (coverage < 1) return { label: "Abaixo do normal — confira os números", tone: "warn" };
  if (coverage < 3) return { label: "Embalagem lisa (~2 ml/m²)", tone: "ok" };
  if (coverage < 5) return { label: "Material gráfico / folder (~4 ml/m²)", tone: "ok" };
  if (coverage < 10) return { label: "Arte carregada / food (6+ ml/m²)", tone: "ok" };
  return { label: "Muito acima do normal — confira os números", tone: "warn" };
}
