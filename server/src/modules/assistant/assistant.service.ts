import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";

const GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_HISTORY_MESSAGES = 20;

const ISSUING_COMPANIES = ["Grafinorte Indústria Gráfica", "Tribuna do Norte", "TN Online", "Pluspack"];

async function buildSystemPrompt(): Promise<string> {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });

  const catalogLines = products.map((p) => {
    const price = p.unitPrice != null ? `R$ ${p.unitPrice.toFixed(2)}` : "preço não cadastrado";
    const specs = p.specifications.replace(/\n/g, "; ");
    return `- ${p.name} — ${specs} — preço de referência: ${price}`;
  });

  return [
    "Você é o assistente de IA interno da Grafinorte Indústria Gráfica, integrado ao sistema de gestão usado por todos os setores da empresa (tarefas, comercial, orçamentos, produção, RH, financeiro, marketing).",
    "Responda em português do Brasil, de forma direta e objetiva, focado em ajudar funcionários no dia a dia de trabalho.",
    "Responda em texto simples, sem markdown (não use **negrito**, #títulos, listas com - ou *, etc.), pois o painel de chat exibe apenas texto puro.",
    `As empresas do grupo são: ${ISSUING_COMPANIES.join(", ")}.`,
    "",
    "Catálogo de produtos e preços de referência atualmente cadastrados no sistema (esta lista é sempre a mais atual; se um produto não estiver aqui, diga que não está cadastrado em vez de inventar specs ou preços):",
    catalogLines.length > 0 ? catalogLines.join("\n") : "(nenhum produto cadastrado no catálogo ainda)",
    "",
    "Se perguntarem sobre preço final de um pedido específico, lembre que o preço de referência é por unidade e que orçamentos formais devem ser gerados pelo setor de Orçamentos no sistema.",
    "Se a pergunta não tiver relação com a Grafinorte ou com o trabalho na empresa, responda normalmente como assistente de uso geral.",
  ].join("\n");
}

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

interface GeminiResponse {
  candidates?: { content: GeminiContent; finishReason?: string }[];
  error?: { code: number; message: string; status: string };
}

async function callGemini(model: string, systemPrompt: string, contents: GeminiContent[]): Promise<GeminiResponse> {
  const url = `${GEMINI_BASE}/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.geminiApiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
    }),
  });
  return res.json() as Promise<GeminiResponse>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function chat(history: ChatMessage[]): Promise<string> {
  if (!env.geminiApiKey) {
    throw new HttpError(503, "O assistente de IA ainda não foi configurado. Peça ao administrador para adicionar a GEMINI_API_KEY no servidor.");
  }

  const systemPrompt = await buildSystemPrompt();
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

  // Map "assistant" → "model" for Gemini format
  const contents: GeminiContent[] = trimmedHistory.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let lastErr = "";

  for (const model of GEMINI_MODELS) {
    try {
      const response = await callGemini(model, systemPrompt, contents);

      if (response.error) {
        const { code, message } = response.error;
        lastErr = `[${code}] ${message}`;
        if (code === 401 || code === 403) {
          throw new HttpError(503, `Acesso negado pela API Gemini: ${message}`);
        }
        continue;
      }

      const textPart = response.candidates?.[0]?.content?.parts?.find((p) => "text" in p);
      const text = textPart?.text?.trim() ?? "";
      if (text) return text;

    } catch (err: unknown) {
      if (err instanceof HttpError) throw err;
      lastErr = err instanceof Error ? err.message : String(err);
      continue;
    }
  }

  throw new HttpError(502, `Não foi possível processar a pergunta. Tente novamente. (${lastErr.slice(0, 200)})`);
}
