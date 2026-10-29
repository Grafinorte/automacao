export interface Dimension {
  widthMm: number;
  heightMm: number;
}

export interface BleedPerSide {
  top: number;    // mm
  bottom: number; // mm
  left: number;   // mm
  right: number;  // mm
}

export interface PageBoxes {
  mediaBox: Dimension;
  cropBox?: Dimension;
  bleedBox?: Dimension;
  trimBox?: Dimension;
  artBox?: Dimension;
  finalSize: Dimension;
  finalSizeSource: "TrimBox" | "CropBox" | "MediaBox";
  detectedSize?: string;
  orientation: "portrait" | "landscape" | "square";
  hasBleed: boolean;
  bleedConfirmed: boolean;
  bleedMm?: number;
  bleedPerSide?: BleedPerSide;
  bleedOk?: boolean;
}

export type ColorConfidence = "confirmed" | "estimated" | "potential" | "unknown";

export interface ColorInfo {
  confidence: ColorConfidence;
  hasRgb: boolean;
  hasCmyk: boolean;
  hasGray: boolean;
  hasSpot: boolean;
  spotColorNames: string[];
  colorSpaceNames: string[];
  operatorsFound: string[];
  /** Per-channel CMYK usage (set when content stream analysis found explicit k/K operators) */
  cmykChannels?: { c: boolean; m: boolean; y: boolean; k: boolean };
}

export interface ImageEntry {
  name: string;
  widthPx: number;
  heightPx: number;
  dpiEffective: number | null;
  colorSpace?: string;
  isLowRes: boolean;
}

export interface ImageInfo {
  count: number;
  lowResCount: number;
  images: ImageEntry[];
  confidence: ColorConfidence;
}

export interface FontInfo {
  name: string;
  type: string;
  embedded: boolean;
  subset: boolean;
  confidence: ColorConfidence;
}

export interface TransparencyInfo {
  hasTransparency: boolean;
  confidence: ColorConfidence;
  details: string[];
}

export interface OverprintInfo {
  hasOverprint: boolean;
  confidence: ColorConfidence;
  details: string[];
}

export interface BlackInfo {
  has100K: boolean;
  hasRichBlack: boolean;
  hasRgbBlack: boolean;
  richBlackInText: boolean;
  richBlackSmallText: boolean;
  rgbBlackInText: boolean;
  confidence: ColorConfidence;
}

export interface TacInfo {
  maxTacPercent?: number;
  confidence: ColorConfidence;
  note: string;
}

export interface PdfxInfo {
  conformance?: string;
  outputIntentProfile?: string;
  hasOutputIntent: boolean;
}

export type AlertSeverity = "error" | "warning" | "info";

export interface PreflightAlert {
  severity: AlertSeverity;
  code: string;
  message: string;
  pageNumbers?: number[];
  detail?: string;
}

export interface PageResult {
  pageNumber: number;
  boxes: PageBoxes;
  color: ColorInfo;
  images: ImageInfo;
  fonts: FontInfo[];
  transparency: TransparencyInfo;
  overprint: OverprintInfo;
  black: BlackInfo;
  tac: TacInfo;
  isBlank: boolean;
  alerts: PreflightAlert[];
}

export interface PreflightSummary {
  overallStatus: "pass" | "warning" | "error";
  errorCount: number;
  warningCount: number;
  infoCount: number;
  pageCount: number;
  hasRgbColors: boolean;
  hasNonEmbeddedFonts: boolean;
  hasLowResImages: boolean;
  hasTransparency: boolean;
  hasOverprint: boolean;
  pdfVersion?: string;
  fileSize: number;
}

export interface PreflightResult {
  fileName: string;
  fileSize: number;
  analyzedAt: string;
  pdfVersion?: string;
  /** Friendly name of the application that created the PDF */
  creatorApp?: string;
  pdfxInfo: PdfxInfo;
  summary: PreflightSummary;
  pages: PageResult[];
  globalAlerts: PreflightAlert[];
  limitations: string[];
}

export class PreflightApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new PreflightApiError(res.status, body.error ?? "Erro desconhecido");
  }
  return res;
}

export async function analyzePdf(file: File): Promise<PreflightResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiFetch("/api/preflight/analyze", { method: "POST", body: formData });
  return res.json() as Promise<PreflightResult>;
}

export interface HistoryRow {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  status: "pass" | "warning" | "error";
  errorCount: number;
  warnCount: number;
  analyzedAt: string;
  resultJson: string;
  user: { id: string; name: string } | null;
}

export async function fetchHistory(): Promise<HistoryRow[]> {
  const res = await apiFetch("/api/preflight/history");
  return res.json() as Promise<HistoryRow[]>;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  await apiFetch(`/api/preflight/history/${id}`, { method: "DELETE" });
}

export async function clearHistory(): Promise<void> {
  await apiFetch("/api/preflight/history", { method: "DELETE" });
}
