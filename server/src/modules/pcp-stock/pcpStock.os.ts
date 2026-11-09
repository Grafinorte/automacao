import { HttpError } from "../../middleware/errorHandler";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

const MAX_PDF_BYTES = 10 * 1024 * 1024;

// O nome do produto vem do Zênite em maiúsculas; a ordem importa ("CAIXA" antes de "CARTÃO")
const CATEGORY_RULES: [RegExp, string][] = [
  [/\bCAIXA/, "Caixa"], [/\bCOPO/, "Copo"], [/\bPOTE/, "Pote"], [/\bBALDE/, "Balde"], [/\bSACOLA/, "Sacola"],
  [/\bFOLDER/, "Folder"], [/CAT[AÁ]LOGO/, "Catálogo"], [/FLYER|PANFLETO/, "Flyer"], [/CARTAZ/, "Cartaz"], [/CART[AÃ]O/, "Cartão"],
];

export interface OsData {
  osNumber: string | null;
  company: "GRAFINORTE" | "PLUSPACK" | null;
  client: string | null;
  clientCode: string | null;
  name: string | null;
  category: string | null;
  orderedQty: number | null;
  plannedQty: number | null;
  perPack: number | null;
}

const toInt = (s: string) => Number(s.replace(/\./g, ""));

/** Lê o texto da OS impressa pelo Zênite. O que não achar volta null para a pessoa preencher. */
export function parseOsText(text: string): OsData {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const osIndex = lines.findIndex((l) => /ORDEM DE SERVI[ÇC]O\s*:?\s*\d+/i.test(l));
  const osNumber = osIndex >= 0 ? lines[osIndex].match(/ORDEM DE SERVI[ÇC]O\s*:?\s*(\d+)/i)![1] : null;

  // A empresa está no cabeçalho; mais abaixo "Faca Grafinorte" aparece até em OS da Pluspack
  const header = (osIndex >= 0 ? lines.slice(0, osIndex) : lines.slice(0, 3)).join(" ");
  const company = /pluspack/i.test(header) ? "PLUSPACK" : /grafinorte/i.test(header) ? "GRAFINORTE" : null;

  const after = osIndex >= 0 ? lines.slice(osIndex + 1) : lines;
  const product = after.map((l) => l.match(/^(\d{1,3}(?:\.\d{3})+|\d+)\s+([^\d\s-][^-]*?)\s+-\s+(.+)$/)).find(Boolean);
  const name = product ? product[3].trim() : null;
  const clientMatch = after.map((l) => l.match(/^Cliente\s*:\s*(?:(\d+)\s*-\s*)?(.+)$/i)).find(Boolean);
  const plan = after.map((l) => l.match(/^(\d+)\s*=\s*\S/)).find(Boolean);
  const pack = text.match(/Qtd por Pacote\s*:?\s*=?\s*(\d+)/i);
  const upper = (name ?? "").toUpperCase();

  return {
    osNumber,
    company,
    client: clientMatch ? clientMatch[2].trim() : null,
    clientCode: clientMatch?.[1] ?? null,
    name,
    category: CATEGORY_RULES.find(([re]) => re.test(upper))?.[1] ?? null,
    orderedQty: product ? toInt(product[1]) : null,
    plannedQty: plan ? Number(plan[1]) : null,
    perPack: pack ? Number(pack[1]) : null,
  };
}

export async function readOsPdf(raw: unknown): Promise<OsData> {
  if (typeof raw !== "string" || !raw) throw new HttpError(400, "Envie o PDF da OS.");
  const buffer = Buffer.from(raw.replace(/^data:[^,]*,/, ""), "base64");
  if (buffer.length > MAX_PDF_BYTES) throw new HttpError(400, "PDF muito grande. O limite é 10 MB.");
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(400, "Esse arquivo não é um PDF.");

  let text: string;
  try {
    text = (await pdfParse(buffer)).text;
  } catch {
    throw new HttpError(400, "Não consegui ler esse PDF.");
  }
  const data = parseOsText(text);
  if (!data.osNumber) throw new HttpError(422, "Esse PDF não parece uma OS do Zênite: não achei o número da OS.");
  return data;
}
