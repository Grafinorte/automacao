export type ConfidenceLevel = "confirmed" | "estimated" | "potential" | "unknown";
export type AlertSeverity = "error" | "warning" | "info";

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
  /** Best guess at intended final size: TrimBox > CropBox > MediaBox */
  finalSize: Dimension;
  /** Where finalSize came from */
  finalSizeSource: "TrimBox" | "CropBox" | "MediaBox";
  detectedSize?: string; // e.g. "A4"
  orientation: "portrait" | "landscape" | "square";
  hasBleed: boolean;
  /** true when a real BleedBox is present (vs MediaBox used as fallback) */
  bleedConfirmed: boolean;
  /** Average bleed margin in mm (kept for backward-compat alerts) */
  bleedMm?: number;
  /** Per-side bleed in mm (calculated from actual box coordinates) */
  bleedPerSide?: BleedPerSide;
  bleedOk?: boolean;
}

export type ColorSpaceType = "CMYK" | "RGB" | "Gray" | "Spot" | "DeviceN" | "ICC" | "Unknown";

export interface ColorInfo {
  confidence: ConfidenceLevel;
  hasRgb: boolean;
  hasCmyk: boolean;
  hasGray: boolean;
  hasSpot: boolean;
  spotColorNames: string[];
  colorSpaceNames: string[];
  /** Operators found in content stream that imply specific color spaces */
  operatorsFound: string[];
  /** Per-channel CMYK usage (set when content stream analysis found explicit k/K operators) */
  cmykChannels?: { c: boolean; m: boolean; y: boolean; k: boolean };
}

export interface ImageEntry {
  name: string;
  widthPx: number;
  heightPx: number;
  /** null = could not determine */
  dpiEffective: number | null;
  colorSpace?: string;
  isLowRes: boolean;
}

export interface ImageInfo {
  count: number;
  lowResCount: number;
  images: ImageEntry[];
  confidence: ConfidenceLevel;
}

export interface FontInfo {
  name: string;
  type: string;
  embedded: boolean;
  subset: boolean;
  confidence: ConfidenceLevel;
}

export interface TransparencyInfo {
  hasTransparency: boolean;
  confidence: ConfidenceLevel;
  details: string[];
}

export interface OverprintInfo {
  hasOverprint: boolean;
  confidence: ConfidenceLevel;
  details: string[];
}

export interface BlackInfo {
  has100K: boolean;
  hasRichBlack: boolean;
  hasRgbBlack: boolean;
  richBlackInText: boolean;
  /** true when rich black was found in text with font size ≤ richBlackTextMaxPtWarning */
  richBlackSmallText: boolean;
  rgbBlackInText: boolean;
  confidence: ConfidenceLevel;
}

export interface TacInfo {
  /** Max TAC found in vector objects (C+M+Y+K when values directly in content stream) */
  maxTacPercent?: number;
  confidence: ConfidenceLevel;
  note: string;
}

export interface PdfxInfo {
  conformance?: string;
  outputIntentProfile?: string;
  hasOutputIntent: boolean;
}

export interface PreflightAlert {
  severity: AlertSeverity;
  code: string;
  message: string;
  pageNumbers?: number[];
  detail?: string;
}

export interface PageResult {
  pageNumber: number; // 1-based
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
  /** Friendly name of the application that created the PDF (detected from metadata) */
  creatorApp?: string;
  pdfxInfo: PdfxInfo;
  summary: PreflightSummary;
  pages: PageResult[];
  globalAlerts: PreflightAlert[];
  limitations: string[];
}
