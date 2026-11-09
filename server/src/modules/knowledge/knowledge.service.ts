import fs from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";
import { prisma } from "../../db/prisma";
import { areasFor } from "./luma-tools";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

// Four levels up from server/src/modules/knowledge → project root → base-conhecimento
const KNOWLEDGE_DIR = path.join(__dirname, "../../../../base-conhecimento");
const MAX_CHARS_PER_DOC = 30_000;
const MAX_TOTAL_CHARS = 120_000;

const SUPPORTED = [".pdf", ".txt", ".md", ".csv"];

const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: { content: GeminiContent }[];
  error?: { code: number; message: string };
}

const MAX_TOOL_ROUNDS = 5;
const BUSY_RETRIES = 2;
const BUSY_WAIT_MS = 2000;

type Tools = Awaited<ReturnType<typeof areasFor>>;

/**
 * Pergunta à IA; quando ela pede uma consulta aos dados, executa (só as liberadas ao usuário)
 * e devolve o resultado, até ela responder em texto.
 */
async function callGemini(systemPrompt: string, contents: GeminiContent[], tools: Tools, usedAreas: Set<string>, mustCall: string[]): Promise<string> {
  let lastErr = "sem resposta";
  for (const model of GEMINI_MODELS) {
    const convo = [...contents];
    let busyRetries = 0;
    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiApiKey },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: convo,
            ...(tools.declarations.length && round < MAX_TOOL_ROUNDS ? { tools: [{ function_declarations: tools.declarations }] } : {}),
            // Pergunta sobre dados: na primeira rodada a IA é obrigada a consultar, não pode responder de cabeça
            ...(round === 0 && mustCall.length
              ? { tool_config: { function_calling_config: { mode: "ANY", allowed_function_names: mustCall } } }
              : {}),
          }),
        });
        const data = (await res.json()) as GeminiResponse;
        if (data.error) {
          const { code, message } = data.error;
          if (code === 401 || code === 403) throw new HttpError(503, `Acesso negado pela API Gemini: ${message}`);
          // Pico de demanda no Google: espera um pouco e tenta de novo a mesma etapa
          if ((code === 503 || code === 429) && busyRetries < BUSY_RETRIES) {
            busyRetries++;
            await new Promise((r) => setTimeout(r, BUSY_WAIT_MS * busyRetries));
            round--;
            continue;
          }
          throw new Error(`[${code}] ${message}`);
        }
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const calls = parts.filter((p): p is { functionCall: { name: string; args: Record<string, unknown> } } => "functionCall" in p);
        if (calls.length === 0) {
          const text = parts.filter((p): p is { text: string } => "text" in p).map((p) => p.text).join("").trim();
          if (text) return text;
          throw new Error("resposta vazia");
        }
        convo.push({ role: "model", parts });
        const results = await Promise.all(calls.map(async (c) => {
          const { area, output } = await tools.run(c.functionCall.name, c.functionCall.args);
          if (area) usedAreas.add(area);
          return { functionResponse: { name: c.functionCall.name, response: { output: JSON.stringify(output) } } };
        }));
        convo.push({ role: "user", parts: results });
      }
      throw new Error("consultas demais sem resposta");
    } catch (err: unknown) {
      if (err instanceof HttpError) throw err;
      lastErr = err instanceof Error ? err.message : String(err);
      continue;
    }
  }
  throw new HttpError(502, `Não foi possível consultar a IA. (${lastErr.slice(0, 200)})`);
}

export interface DocInfo {
  name: string;      // relative path shown to users, e.g. "Manual da pluspack/Boas Vindas.pdf"
  ext: string;
  sizeBytes: number;
  fullPath: string;  // absolute path for reading
}

function scanDir(dir: string, baseDir: string): DocInfo[] {
  const results: DocInfo[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDir(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED.includes(ext)) {
        const stat = fs.statSync(fullPath);
        const relativeName = path.relative(baseDir, fullPath).replace(/\\/g, "/");
        results.push({ name: relativeName, ext, sizeBytes: stat.size, fullPath });
      }
    }
  }
  return results;
}

export async function listDocuments(): Promise<DocInfo[]> {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
    return [];
  }
  return scanDir(KNOWLEDGE_DIR, KNOWLEDGE_DIR)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    const buf = fs.readFileSync(filePath);
    const result = await pdfParse(buf);
    return result.text ?? "";
  }
  return fs.readFileSync(filePath, "utf-8");
}

export interface AskResult {
  answer: string;
  sources: string[];
}

// ─── Conversation persistence ──────────────────────────────────────────────────

export function listConversations(userId: string) {
  return prisma.lumaConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
    take: 50,
  });
}

export async function saveConversation(
  userId: string,
  id: string | null,
  title: string,
  messages: unknown[]
) {
  const data = { title: title.slice(0, 100), messages: JSON.stringify(messages), userId };
  if (id) {
    return prisma.lumaConversation.upsert({
      where: { id },
      update: { title: data.title, messages: data.messages },
      create: { id, ...data },
    });
  }
  return prisma.lumaConversation.create({ data });
}

export async function getConversation(id: string, userId: string) {
  const conv = await prisma.lumaConversation.findFirst({ where: { id, userId } });
  if (!conv) return null;
  return { ...conv, messages: JSON.parse(conv.messages) };
}

export async function deleteConversation(id: string, userId: string) {
  await prisma.lumaConversation.deleteMany({ where: { id, userId } });
}

// ──────────────────────────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")          // ### headings
    .replace(/\*\*(.+?)\*\*/gs, "$1")     // **bold**
    .replace(/\*(.+?)\*/gs, "$1")         // *italic*
    .replace(/_{2}(.+?)_{2}/gs, "$1")     // __bold__
    .replace(/_(.+?)_/gs, "$1")           // _italic_
    .replace(/`{3}[\s\S]*?`{3}/g, "")     // ```code blocks```
    .replace(/`(.+?)`/g, "$1")            // `inline code`
    .replace(/^[-*]\s+/gm, "• ")          // bullet points → •
    .replace(/^\d+\.\s+/gm, (m) => m)     // keep numbered lists as-is
    .replace(/^-{3,}$/gm, "")             // --- horizontal rules
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")   // [link text](url) → link text
    .replace(/\n{3,}/g, "\n\n")           // collapse excess blank lines
    .trim();
}

export async function askQuestion(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
  userId: string,
): Promise<AskResult> {
  if (!env.geminiApiKey) {
    throw new HttpError(503, "GEMINI_API_KEY não configurada no servidor.");
  }

  const docs = await listDocuments();
  const tools = await areasFor(userId);

  const loaded: { name: string; text: string }[] = [];
  let totalChars = 0;

  for (const doc of docs) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    try {
      let text = await extractText(doc.fullPath);
      text = text.trim().slice(0, MAX_CHARS_PER_DOC);
      if (text) {
        loaded.push({ name: doc.name, text });
        totalChars += text.length;
      }
    } catch {
      // skip unreadable files
    }
  }

  const contextBlock = loaded
    .map((d) => `=== DOCUMENTO: ${d.name} ===\n${d.text}`)
    .join("\n\n---\n\n");

  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const mustCall = tools.requiredFor(question);
  const denied = mustCall.length ? [] : tools.deniedFor(question);
  const systemPrompt = [
    "Você é a Luma, assistente da Grafinorte Indústria Gráfica (e da Pluspack Embalagens).",
    `Hoje é ${today}.`,
    "Você responde de duas fontes:",
    "1) Os documentos da base de conhecimento, abaixo. Ao usar um documento, cite a fonte entre parênteses, ex: (Fonte: manual.pdf).",
    tools.labels.length
      ? `2) Dados reais da plataforma, pelas consultas disponíveis, das áreas: ${tools.labels.join(", ")}. Para perguntas sobre números, clientes, OS, notas, estoque ou custos, use as consultas antes de responder; nunca invente números. Não cite o nome das consultas; se quiser indicar a origem, diga só a área (ex.: "segundo o Estoque PCP").`
      : "2) O seu usuário não tem acesso a dados da plataforma pela Luma.",
    "Fale diretamente com a pessoa (você). Se a pergunta for sobre uma área que não está na lista acima, explique que o seu perfil não tem acesso a esses dados pela Luma e que um administrador pode liberar.",
    "Números de OS, notas, saldos, valores e datas só podem vir das consultas. Nunca use exemplos nem números que não vieram de uma consulta.",
    ...(denied.length
      ? [`ATENÇÃO: esta pergunta é sobre ${denied.join(" e ")}, que este usuário não pode consultar. Responda apenas que o perfil dele não tem acesso a esses dados pela Luma e que um administrador pode liberar. Não dê nenhum número nem exemplo.`]
      : []),
    "Se não encontrar a informação, diga claramente que não encontrou.",
    "Responda em português do Brasil, de forma clara, objetiva e organizada. Valores em R$, datas no formato DD/MM/AAAA, números com separador de milhar (10.000).",
    "IMPORTANTE: NÃO use formatação markdown. Não use asteriscos (**), hashtags (#), underlines (_) ou qualquer outro marcador de formatação. Escreva em texto simples; listas podem usar • no começo da linha.",
    "",
    "DOCUMENTOS CARREGADOS:",
    contextBlock ? contextBlock.slice(0, MAX_TOTAL_CHARS) : "(nenhum documento na base de conhecimento)",
  ].join("\n");

  const contents: GeminiContent[] = [
    ...history.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    })),
    { role: "user" as const, parts: [{ text: question }] },
  ];

  const usedAreas = new Set<string>();
  const raw = await callGemini(systemPrompt, contents, tools, usedAreas, mustCall);
  const answer = stripMarkdown(raw);
  // Fontes: as áreas de dados consultadas e os documentos carregados
  return { answer, sources: [...[...usedAreas].map((a) => `Dados: ${a}`), ...loaded.map((d) => d.name)] };
}
