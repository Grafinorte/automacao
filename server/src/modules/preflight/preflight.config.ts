export const PREFLIGHT_CONFIG = {
  expectedColorMode: "CMYK",
  rgbIsError: true,
  minimumBleedMm: 3,
  bleedToleranceMm: 0.2,
  sizeToleranceMm: 0.5,
  spotColorRequiresReview: true,
  minimumImageDpi: 300,
  warningImageDpi: 200,
  nonEmbeddedFontIsError: true,
  transparencyRequiresReview: true,
  overprintRequiresReview: true,
  richBlackTextRequiresReview: true,
  rgbBlackIsError: true,
  maximumTacPercent: 300,
  blankPageRequiresReview: true,
  /** Tamanho máximo em pontos para que preto composto em texto gere alerta (≤ = aviso) */
  richBlackTextMaxPtWarning: 18,
  maxPdfSizeMb: 200,
  maxPages: 500,
  maxObjectsToAnalyze: 50000,
} as const;

// Standard paper sizes in mm (width × height, portrait) with ±0.5mm tolerance
export const KNOWN_SIZES: Array<{ name: string; widthMm: number; heightMm: number }> = [
  { name: "A0", widthMm: 841, heightMm: 1189 },
  { name: "A1", widthMm: 594, heightMm: 841 },
  { name: "A2", widthMm: 420, heightMm: 594 },
  { name: "A3", widthMm: 297, heightMm: 420 },
  { name: "A4", widthMm: 210, heightMm: 297 },
  { name: "A5", widthMm: 148, heightMm: 210 },
  { name: "A6", widthMm: 105, heightMm: 148 },
  { name: "Letter", widthMm: 215.9, heightMm: 279.4 },
  { name: "Legal", widthMm: 215.9, heightMm: 355.6 },
  { name: "Tabloid", widthMm: 279.4, heightMm: 431.8 },
];
