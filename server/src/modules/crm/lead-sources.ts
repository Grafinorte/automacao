import { HttpError } from "../../middleware/errorHandler";

export const LEAD_SOURCE_LABELS = {
  SITE: "Site",
  LANDING_PAGE: "Landing page",
  PROSPECCAO_ATIVA: "Prospecção ativa (comercial foi atrás)",
  CLIENTE_PROCUROU: "Cliente procurou a empresa",
  INDICACAO: "Indicação",
  OUTRO: "Outro",
} as const;

export type LeadSource = keyof typeof LEAD_SOURCE_LABELS;

/** undefined = campo não enviado; null/"" = limpar; valor inválido = erro 400 */
export function parseLeadSource(value: unknown): LeadSource | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "string" && value in LEAD_SOURCE_LABELS) return value as LeadSource;
  throw new HttpError(400, "Origem do lead inválida");
}

/** Origem enviada pelo formulário do site/LP (texto livre) → origem padronizada */
export function leadSourceFromWebhook(raw?: string | null): LeadSource {
  const s = (raw ?? "").toLowerCase();
  if (/\blp\b|landing/.test(s)) return "LANDING_PAGE";
  return "SITE";
}
