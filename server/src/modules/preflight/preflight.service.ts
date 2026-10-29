import { PDFDocument } from "pdf-lib";
import type {
  PreflightResult,
  PageResult,
  PreflightAlert,
  PreflightSummary,
} from "./preflight.types";
import { PREFLIGHT_CONFIG } from "./preflight.config";
import { analyzeBoxes } from "./analyzers/boxes.analyzer";
import { analyzeColors } from "./analyzers/color.analyzer";
import { analyzeFonts } from "./analyzers/font.analyzer";
import { analyzeImages } from "./analyzers/image.analyzer";
import { analyzeTransparency } from "./analyzers/transparency.analyzer";
import { analyzeOverprint } from "./analyzers/overprint.analyzer";
import { analyzeBlack } from "./analyzers/black.analyzer";
import { analyzeTac } from "./analyzers/tac.analyzer";
import { analyzePdfX } from "./analyzers/pdfx.analyzer";
import { isPageBlank } from "./analyzers/blank-page.analyzer";

// ─── Creator App Detection ─────────────────────────────────────────────────────
function detectCreatorApp(doc: PDFDocument, pdfBytes: Buffer): string {
  let creator = "";
  let producer = "";
  try { creator = doc.getCreator() ?? ""; } catch { /* ignore */ }
  try { producer = doc.getProducer() ?? ""; } catch { /* ignore */ }

  // Try XMP CreatorTool from raw bytes (scan first 300 KB)
  let xmpCreatorTool = "";
  try {
    const slice = pdfBytes.slice(0, Math.min(pdfBytes.length, 307_200)).toString("latin1");
    const xmpMatch = /<[a-zA-Z]+:CreatorTool[^>]*>([^<]+)<\/[a-zA-Z]+:CreatorTool>/i.exec(slice);
    if (xmpMatch) xmpCreatorTool = xmpMatch[1].trim();
  } catch { /* ignore */ }

  const combined = `${creator} ${producer} ${xmpCreatorTool}`;

  if (/indesign/i.test(combined))           return "Adobe InDesign";
  if (/illustrator/i.test(combined))        return "Adobe Illustrator";
  if (/photoshop/i.test(combined))          return "Adobe Photoshop";
  if (/canva/i.test(combined))              return "Canva";
  if (/microsoft\s*word|msword/i.test(combined)) return "Microsoft Word";
  if (/google\s*docs/i.test(combined))      return "Google Docs";
  if (/google/i.test(combined))             return "Google Docs";
  if (/libreoffice/i.test(combined))        return "LibreOffice";
  if (/coreldraw/i.test(combined))          return "CorelDRAW";
  if (/affinity/i.test(combined))           return "Affinity Publisher/Designer";
  if (/scribus/i.test(combined))            return "Scribus";

  const raw = (xmpCreatorTool || creator || producer).trim();
  return raw || "Desconhecido";
}

function generatePageAlerts(page: PageResult): PreflightAlert[] {
  const alerts: PreflightAlert[] = [];

  // Color alerts
  if (page.color.hasRgb && PREFLIGHT_CONFIG.rgbIsError) {
    alerts.push({
      severity: "error",
      code: "RGB_COLOR",
      message: "Cores RGB detectadas na página",
      detail: `Operadores encontrados: ${page.color.operatorsFound.join(", ")}. ` +
        "Converta todas as cores para CMYK antes da impressão.",
    });
  }

  if (page.color.hasSpot && PREFLIGHT_CONFIG.spotColorRequiresReview) {
    alerts.push({
      severity: "warning",
      code: "SPOT_COLOR",
      message: `Cor spot detectada: ${page.color.spotColorNames.join(", ") || "desconhecida"}`,
      detail: "Verifique se as cores spot são intencionais ou se devem ser convertidas para CMYK.",
    });
  }

  // Font alerts
  for (const font of page.fonts) {
    if (!font.embedded && PREFLIGHT_CONFIG.nonEmbeddedFontIsError) {
      alerts.push({
        severity: "error",
        code: "FONT_NOT_EMBEDDED",
        message: `Fonte não incorporada: ${font.name} (${font.type})`,
        detail: "Fontes não incorporadas podem causar substituição na impressão.",
      });
    }
  }

  // Bleed alerts
  if (page.boxes.trimBox) {
    if (!page.boxes.hasBleed) {
      alerts.push({
        severity: "warning",
        code: "NO_BLEED",
        message: "Sangria não detectada",
        detail: `TrimBox presente mas não há BleedBox ou a diferença para a MediaBox é insuficiente. ` +
          `Mínimo esperado: ${PREFLIGHT_CONFIG.minimumBleedMm}mm.`,
      });
    } else if (page.boxes.bleedMm !== undefined && !page.boxes.bleedOk) {
      alerts.push({
        severity: "warning",
        code: "INSUFFICIENT_BLEED",
        message: `Sangria insuficiente: ${page.boxes.bleedMm.toFixed(1)}mm`,
        detail: `Mínimo esperado: ${PREFLIGHT_CONFIG.minimumBleedMm}mm.`,
      });
    }
  } else {
    alerts.push({
      severity: "info",
      code: "NO_TRIM_BOX",
      message: "TrimBox não definida",
      detail: "Sem TrimBox não é possível verificar a sangria. O tamanho final usado é o MediaBox/CropBox.",
    });
  }

  // Transparency alerts
  if (page.transparency.hasTransparency && PREFLIGHT_CONFIG.transparencyRequiresReview) {
    alerts.push({
      severity: "warning",
      code: "TRANSPARENCY",
      message: "Transparência detectada",
      detail: page.transparency.details.join("; ") || "Verifique se a transparência está achatada para impressão.",
    });
  }

  // Overprint alerts
  if (page.overprint.hasOverprint && PREFLIGHT_CONFIG.overprintRequiresReview) {
    alerts.push({
      severity: "warning",
      code: "OVERPRINT",
      message: "Overprint detectado",
      detail: page.overprint.details.join("; "),
    });
  }

  // Black type alerts
  if (page.black.richBlackSmallText && PREFLIGHT_CONFIG.richBlackTextRequiresReview) {
    alerts.push({
      severity: "warning",
      code: "RICH_BLACK_SMALL_TEXT",
      message: `Preto composto em texto fino/pequeno (≤${PREFLIGHT_CONFIG.richBlackTextMaxPtWarning}pt)`,
      detail:
        "Texto pequeno ou fino com preto composto (CMYK com vários canais ativos). " +
        "O desalinhamento das 4 chapas causa texto borrado. Use 0C 0M 0Y 100K para texto miúdo.",
    });
  } else if (page.black.richBlackInText && PREFLIGHT_CONFIG.richBlackTextRequiresReview) {
    alerts.push({
      severity: "info",
      code: "RICH_BLACK_TEXT",
      message: "Preto composto detectado em texto grande",
      detail:
        "Texto com tamanho grande usando preto composto. Em títulos e manchetes é geralmente aceitável.",
    });
  }

  if (page.black.rgbBlackInText && PREFLIGHT_CONFIG.rgbBlackIsError) {
    alerts.push({
      severity: "error",
      code: "RGB_BLACK_TEXT",
      message: "Texto com preto RGB (0,0,0) detectado",
      detail: "Textos em preto RGB não serão impressos em preto puro. Use C=0 M=0 Y=0 K=100.",
    });
  } else if (page.black.hasRgbBlack && PREFLIGHT_CONFIG.rgbBlackIsError) {
    alerts.push({
      severity: "warning",
      code: "RGB_BLACK",
      message: "Objeto com preto RGB (0,0,0) detectado",
      detail: "Objetos em preto RGB podem não imprimir como preto puro.",
    });
  }

  // TAC alerts
  if (
    page.tac.maxTacPercent !== undefined &&
    page.tac.maxTacPercent > PREFLIGHT_CONFIG.maximumTacPercent
  ) {
    alerts.push({
      severity: "warning",
      code: "HIGH_TAC",
      message: `TAC estimado alto: ${page.tac.maxTacPercent}%`,
      detail: `Limite configurado: ${PREFLIGHT_CONFIG.maximumTacPercent}%. ` +
        "Valores altos podem causar problemas de secagem.",
    });
  }

  // Blank page alert
  if (page.isBlank && PREFLIGHT_CONFIG.blankPageRequiresReview) {
    alerts.push({
      severity: "info",
      code: "BLANK_PAGE",
      message: "Página aparentemente em branco",
      detail: "Verifique se esta página é intencional.",
    });
  }

  return alerts;
}

function buildSummary(
  pages: PageResult[],
  fileSize: number,
  pdfVersion?: string
): PreflightSummary {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const page of pages) {
    for (const alert of page.alerts) {
      if (alert.severity === "error") errorCount++;
      else if (alert.severity === "warning") warningCount++;
      else infoCount++;
    }
  }

  const hasRgbColors = pages.some((p) => p.color.hasRgb);
  const hasNonEmbeddedFonts = pages.some((p) => p.fonts.some((f) => !f.embedded));
  const hasLowResImages = pages.some((p) => p.images.lowResCount > 0);
  const hasTransparency = pages.some((p) => p.transparency.hasTransparency);
  const hasOverprint = pages.some((p) => p.overprint.hasOverprint);

  const overallStatus =
    errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "pass";

  return {
    overallStatus,
    errorCount,
    warningCount,
    infoCount,
    pageCount: pages.length,
    hasRgbColors,
    hasNonEmbeddedFonts,
    hasLowResImages,
    hasTransparency,
    hasOverprint,
    pdfVersion,
    fileSize,
  };
}

export async function analyzePdf(
  pdfBytes: Buffer,
  fileName: string
): Promise<PreflightResult> {
  const fileSize = pdfBytes.length;

  // Size check
  if (fileSize > PREFLIGHT_CONFIG.maxPdfSizeMb * 1024 * 1024) {
    throw new Error(
      `Arquivo muito grande. Tamanho máximo: ${PREFLIGHT_CONFIG.maxPdfSizeMb}MB`
    );
  }

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
  } catch (err) {
    throw new Error(
      `Não foi possível carregar o PDF: ${err instanceof Error ? err.message : "erro desconhecido"}`
    );
  }

  const pageCount = doc.getPageCount();

  if (pageCount === 0) {
    throw new Error("O PDF não contém páginas.");
  }

  if (pageCount > PREFLIGHT_CONFIG.maxPages) {
    throw new Error(
      `PDF com muitas páginas (${pageCount}). Máximo suportado: ${PREFLIGHT_CONFIG.maxPages}`
    );
  }

  // Extract PDF version from raw header
  let pdfVersion: string | undefined;
  try {
    const headerBytes = pdfBytes.slice(0, 20).toString("latin1");
    const versionMatch = /%PDF-(\d+\.\d+)/.exec(headerBytes);
    if (versionMatch) pdfVersion = versionMatch[1];
  } catch {
    // ignore
  }

  // Creator app detection
  const creatorApp = detectCreatorApp(doc, pdfBytes);

  // PDF/X analysis (global)
  const pdfxInfo = analyzePdfX(doc);

  // Per-page analysis
  const pages: PageResult[] = [];

  for (let i = 0; i < pageCount; i++) {
    const pageNumber = i + 1;

    let boxes;
    try {
      boxes = analyzeBoxes(doc, i);
    } catch {
      boxes = {
        mediaBox: { widthMm: 0, heightMm: 0 },
        finalSize: { widthMm: 0, heightMm: 0 },
        finalSizeSource: "MediaBox" as const,
        orientation: "portrait" as const,
        hasBleed: false,
        bleedConfirmed: false,
      };
    }

    const color = analyzeColors(doc, i);
    const fonts = analyzeFonts(doc, i);
    const images = analyzeImages(doc, i);
    const transparency = analyzeTransparency(doc, i);
    const overprint = analyzeOverprint(doc, i);
    const black = analyzeBlack(doc, i);
    const tac = analyzeTac(doc, i);
    const blank = isPageBlank(doc, i);

    const pageResult: PageResult = {
      pageNumber,
      boxes,
      color,
      fonts,
      images,
      transparency,
      overprint,
      black,
      tac,
      isBlank: blank,
      alerts: [],
    };

    pageResult.alerts = generatePageAlerts(pageResult);
    pages.push(pageResult);
  }

  // Global alerts (file-level)
  const globalAlerts: PreflightAlert[] = [];

  if (!pdfxInfo.hasOutputIntent) {
    globalAlerts.push({
      severity: "info",
      code: "NO_OUTPUT_INTENT",
      message: "OutputIntent não encontrado",
      detail: "Para impressão offset, recomenda-se OutputIntent FOGRA39 ou ISO Coated v2.",
    });
  }

  const summary = buildSummary(pages, fileSize, pdfVersion);

  // Limitations note
  const limitations: string[] = [
    "DPI efetivo de imagens não é calculado (requer análise da matriz CTM do content stream).",
    "Análise de cores via operadores de content stream é estimativa — compressão não-FlateDecode não é decodificada.",
    "TAC de imagens raster CMYK não é determinado sem decodificar os dados de pixel.",
    "ICC profiles não são interpretados — o espaço de cor real de objetos com ICCBased pode diferir do reportado.",
    "Transparência em conteúdo não-FlateDecode pode não ser detectada.",
    "Fontes Type3 são indicadas como incorporadas por definição, mas podem não ser totalmente portáveis.",
  ];

  return {
    fileName,
    fileSize,
    analyzedAt: new Date().toISOString(),
    pdfVersion,
    creatorApp,
    pdfxInfo,
    summary,
    pages,
    globalAlerts,
    limitations,
  };
}
