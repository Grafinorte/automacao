import type { TacInfo } from "../preflight.types";
import { PREFLIGHT_CONFIG } from "../preflight.config";
import { getPageContentStreamText } from "./stream.utils";
import { PDFDocument } from "pdf-lib";

/**
 * TAC (Total Area Coverage) analysis.
 * For vector CMYK: TAC = C + M + Y + K (when directly in content stream).
 * For raster CMYK images: undetermined without decoding image data.
 * NEVER calculate TAC from RGB conversion.
 */
export function analyzeTac(doc: PDFDocument, pageIndex: number): TacInfo {
  const streamText = getPageContentStreamText(doc, pageIndex);

  if (!streamText) {
    return {
      confidence: "unknown",
      note: "Não foi possível decodificar o stream de conteúdo para análise de TAC.",
    };
  }

  let maxTac: number | undefined;
  let foundCmyk = false;

  // Parse CMYK operators: 4 numbers followed by k or K
  const cmykPattern = /([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+[kK]\b/g;
  let m = cmykPattern.exec(streamText);
  while (m) {
    const c = parseFloat(m[1]);
    const mg = parseFloat(m[2]);
    const y = parseFloat(m[3]);
    const k = parseFloat(m[4]);

    if (!isNaN(c) && !isNaN(mg) && !isNaN(y) && !isNaN(k)) {
      foundCmyk = true;
      const tac = (c + mg + y + k) * 100; // convert 0-1 to percentage
      if (maxTac === undefined || tac > maxTac) maxTac = tac;
    }
    m = cmykPattern.exec(streamText);
  }

  if (!foundCmyk) {
    return {
      confidence: "unknown",
      note:
        "Nenhum operador CMYK vetorial encontrado no stream de conteúdo. " +
        "O TAC de imagens raster CMYK não pode ser determinado sem decodificar os dados de imagem. " +
        "Não é possível calcular TAC a partir de conversão de RGB.",
    };
  }

  const exceeds = maxTac !== undefined && maxTac > PREFLIGHT_CONFIG.maximumTacPercent;

  return {
    maxTacPercent: maxTac !== undefined ? Math.round(maxTac) : undefined,
    confidence: "estimated",
    note:
      maxTac !== undefined
        ? `TAC máximo estimado (apenas objetos vetoriais CMYK): ${Math.round(maxTac)}%. ` +
          `Limite configurado: ${PREFLIGHT_CONFIG.maximumTacPercent}%. ` +
          (exceeds ? "ATENÇÃO: pode exceder o limite." : "Dentro do limite.") +
          " TAC de imagens raster não foi analisado."
        : "Nenhum valor CMYK calculável encontrado.",
  };
}
