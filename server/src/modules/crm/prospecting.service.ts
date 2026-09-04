import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";

export interface ProspectingInput {
  segmento: string;
  regiao: string;
  quantidade: number;
  observacoes?: string;
}

export interface ProspectCompany {
  nome: string;
  cidade: string;
  telefone: string;
  porte: string;
  redeSocial: string;
  fontes: string;
  confiabilidade: string;
}

export interface ProspectingResult {
  raw: string;
  companies: ProspectCompany[];
}

const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
];

function buildPrompt(input: ProspectingInput): string {
  return `Pesquise no Google e liste ${input.quantidade} empresas reais e ativas do segmento "${input.segmento}" na região "${input.regiao}".
${input.observacoes?.trim() ? `FOCO: ${input.observacoes.trim()}\n` : ""}
Para cada empresa busque: nome, cidade, telefone comercial e Instagram/Facebook.

Retorne APENAS esta tabela markdown (sem texto antes ou depois):

| Nome da empresa | Cidade | Telefone | Porte da empresa | Rede social principal | Fonte(s) de validação | Observação de confiabilidade |

- Telefone: (DDD) NÚMERO ou vazio
- Porte: Pequena, Média ou Grande
- Rede social: @usuario ou link
- Fonte(s): onde encontrou (ex: "Google Maps", "Site oficial")
- Observação: "Dados verificados" ou ressalva`;
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const HEADER_KEY_MAP: Record<string, keyof ProspectCompany> = {
  "nome da empresa": "nome",
  cidade: "cidade",
  telefone: "telefone",
  "porte da empresa": "porte",
  "rede social principal": "redeSocial",
  "fonte(s) de validacao": "fontes",
  "fontes de validacao": "fontes",
  "observacao de confiabilidade": "confiabilidade",
};

function parseLine(
  line: string,
  headerKeys: Array<keyof ProspectCompany | null>
): ProspectCompany | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  if (/^\|[\s:-]+\|$/.test(trimmed)) return null; // separator row

  const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.every((c) => !c)) return null;

  const row: ProspectCompany = {
    nome: "", cidade: "", telefone: "", porte: "",
    redeSocial: "", fontes: "", confiabilidade: "",
  };
  headerKeys.forEach((key, idx) => {
    if (key && cells[idx] !== undefined) row[key] = cells[idx];
  });
  return row.nome ? row : null;
}

export function parseMarkdownTable(raw: string): ProspectCompany[] {
  const lines = raw.split("\n").map((l) => l.trim());
  const tableLines = lines.filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (tableLines.length < 2) return [];

  const headerCells = tableLines[0].split("|").slice(1, -1).map((c) => stripAccents(c));
  const columnKeys = headerCells.map((h) => HEADER_KEY_MAP[h] ?? null);
  const dataLines = tableLines.slice(1).filter((l) => !/^\|[\s:-]+\|$/.test(l));

  return dataLines
    .map((l) => parseLine(l, columnKeys))
    .filter((c): c is ProspectCompany => c !== null);
}

function makeModel(genAI: GoogleGenerativeAI, modelName: string) {
  return genAI.getGenerativeModel(
    { model: modelName, tools: [{ googleSearch: {} } as never] },
    { apiVersion: "v1beta" }
  );
}

export async function streamProspecting(
  input: ProspectingInput,
  onCompany: (company: ProspectCompany) => void
): Promise<string> {
  if (!env.geminiApiKey) {
    throw new HttpError(503, "Chave do Gemini não configurada.");
  }

  const genAI = new GoogleGenerativeAI(env.geminiApiKey);
  const prompt = buildPrompt(input);

  for (const modelName of MODELS) {
    try {
      const model = makeModel(genAI, modelName);
      const streamResult = await model.generateContentStream({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let fullText = "";
      let lineBuffer = "";
      let headerKeys: Array<keyof ProspectCompany | null> | null = null;

      function processLine(line: string) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return;
        if (/^\|[\s:-]+\|$/.test(trimmed)) return;

        if (headerKeys === null) {
          const cells = trimmed.split("|").slice(1, -1).map((c) => stripAccents(c.trim()));
          headerKeys = cells.map((h) => HEADER_KEY_MAP[h] ?? null);
          return;
        }
        const company = parseLine(trimmed, headerKeys);
        if (company) onCompany(company);
      }

      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (!text) continue;
        fullText += text;
        lineBuffer += text;

        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      }

      if (lineBuffer) processLine(lineBuffer);

      return fullText;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes("503") || msg.includes("overloaded") ||
        msg.includes("high demand") || msg.includes("unavailable");
      if (isRetryable) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (msg.includes("401") || msg.includes("403")) {
        throw new HttpError(503, "Chave do Gemini inválida ou sem permissão.");
      }
      continue;
    }
  }

  throw new HttpError(502, "Gemini indisponível. Tente novamente em instantes.");
}

export async function runProspecting(input: ProspectingInput): Promise<ProspectingResult> {
  const companies: ProspectCompany[] = [];
  const raw = await streamProspecting(input, (c) => companies.push(c));
  return { raw, companies };
}
