import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";
import { prisma } from "../../db/prisma";

const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}
interface GeminiResponse {
  candidates?: { content: GeminiContent }[];
  error?: { code: number; message: string };
}

async function callGemini(systemPrompt: string, contents: GeminiContent[]): Promise<string> {
  if (!env.geminiApiKey) throw new HttpError(503, "GEMINI_API_KEY não configurada.");
  let lastErr = "sem resposta";
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiApiKey },
        body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents }),
      });
      const data = (await res.json()) as GeminiResponse;
      if (data.error) {
        lastErr = `[${data.error.code}] ${data.error.message}`;
        if (data.error.code === 401 || data.error.code === 403) throw new HttpError(503, `Acesso negado: ${data.error.message}`);
        continue;
      }
      const text = data.candidates?.[0]?.content?.parts?.find((p) => "text" in p)?.text?.trim();
      if (text) return text;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  throw new HttpError(502, `Não foi possível consultar a IA. (${lastErr.slice(0, 200)})`);
}

const SYSTEM_PROMPT = `Você é Lisania, assistente inteligente de Recursos Humanos da Grafinorte.
Você tem amplo conhecimento em:
- Legislação trabalhista brasileira (CLT, reformas, convenções coletivas)
- Gestão de pessoas e boas práticas de RH
- Cálculos trabalhistas (férias, 13º, rescisões, FGTS)
- Recrutamento e seleção
- Treinamento e desenvolvimento
- Compliance e normas de saúde/segurança do trabalho
- Benefícios, folha de pagamento e eSocial
Responda em português do Brasil, de forma clara, objetiva e profissional.
Quando houver dúvida sobre detalhes específicos da empresa, peça mais contexto.`;

export async function askHr(
  question: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const contents: GeminiContent[] = [
    ...history.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    })),
    { role: "user" as const, parts: [{ text: question }] },
  ];
  return callGemini(SYSTEM_PROMPT, contents);
}

// ── Conversation persistence (reuses luma_conversations with source="hr") ──────

export function listConversations(userId: string) {
  return prisma.lumaConversation.findMany({
    where: { userId, source: "hr" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
    take: 50,
  });
}

export async function saveConversation(userId: string, id: string | null, title: string, messages: unknown[]) {
  const data = { title: title.slice(0, 100), messages: JSON.stringify(messages), userId, source: "hr" };
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
  const conv = await prisma.lumaConversation.findFirst({ where: { id, userId, source: "hr" } });
  if (!conv) return null;
  return { ...conv, messages: JSON.parse(conv.messages) };
}

export async function deleteConversation(id: string, userId: string) {
  await prisma.lumaConversation.deleteMany({ where: { id, userId, source: "hr" } });
}
