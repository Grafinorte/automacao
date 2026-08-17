import fs from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";
import { prisma } from "../../db/prisma";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

// Four levels up from server/src/modules/knowledge → project root → base-conhecimento
const KNOWLEDGE_DIR = path.join(__dirname, "../../../../base-conhecimento");
const MAX_CHARS_PER_DOC = 30_000;
const MAX_TOTAL_CHARS = 120_000;

const SUPPORTED = [".pdf", ".txt", ".md", ".csv"];

const GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

interface GeminiResponse {
  candidates?: { content: GeminiContent }[];
  error?: { code: number; message: string };
}

async function callGemini(
  systemPrompt: string,
  contents: GeminiContent[]
): Promise<string> {
  let lastErr = "sem resposta";
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiApiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
      });
      const data = (await res.json()) as GeminiResponse;
      if (data.error) {
        const { code, message } = data.error;
        lastErr = `[${code}] ${message}`;
        if (code === 401 || code === 403) {
          throw new HttpError(503, `Acesso negado pela API Gemini: ${message}`);
        }
        continue;
      }
      const text = data.candidates?.[0]?.content?.parts?.find((p) => "text" in p)?.text?.trim();
      if (text) return text;
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
  history: { role: "user" | "assistant"; content: string }[]
): Promise<AskResult> {
  if (!env.geminiApiKey) {
    throw new HttpError(503, "GEMINI_API_KEY não configurada no servidor.");
  }

  const docs = await listDocuments();

  if (docs.length === 0) {
    return {
      answer:
        "Nenhum documento encontrado na pasta base-conhecimento. Adicione arquivos PDF, TXT, MD ou CSV na pasta e tente novamente.",
      sources: [],
    };
  }

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

  const systemPrompt = [
    "Você é a Luma, assistente de base de conhecimento da Grafinorte Indústria Gráfica.",
    "Responda perguntas baseando-se EXCLUSIVAMENTE nos documentos fornecidos abaixo.",
    "Se a informação não estiver nos documentos, diga claramente que não encontrou.",
    "Quando citar informações, mencione o nome do documento fonte entre parênteses, ex: (Fonte: manual.pdf).",
    "Responda em português do Brasil, de forma clara, objetiva e organizada.",
    "IMPORTANTE: NÃO use formatação markdown. Não use asteriscos (**), hashtags (#), underlines (_) ou qualquer outro marcador de formatação. Escreva em texto simples corrido.",
    "",
    "DOCUMENTOS CARREGADOS:",
    contextBlock.slice(0, MAX_TOTAL_CHARS),
  ].join("\n");

  const contents: GeminiContent[] = [
    ...history.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    })),
    { role: "user" as const, parts: [{ text: question }] },
  ];

  const raw = await callGemini(systemPrompt, contents);
  const answer = stripMarkdown(raw);
  return { answer, sources: loaded.map((d) => d.name) };
}
