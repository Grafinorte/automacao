import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";

// ─── Tool implementations ──────────────────────────────────────────────────────

async function getPipelineSummary() {
  const stages = await prisma.crmStage.findMany({
    include: { deals: { select: { value: true } } },
    orderBy: { order: "asc" },
  });
  return stages.map((s) => ({
    etapa: s.name,
    quantidade: s.deals.length,
    valor_total: s.deals.reduce((sum, d) => sum + d.value, 0),
    ganhos: s.isWon,
    fechado: s.isClosed,
  }));
}

async function getStalledDeals(days: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days || 7));
  const deals = await prisma.deal.findMany({
    where: {
      stage: { isClosed: false },
      OR: [
        { activities: { none: {} } },
        { activities: { every: { createdAt: { lt: cutoff } } } },
      ],
    },
    include: {
      contact: { select: { name: true, company: true } },
      stage: { select: { name: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 1 },
      owner: { select: { name: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });
  return deals.map((d) => ({
    titulo: d.title,
    contato: d.contact.name,
    empresa: d.contact.company,
    etapa: d.stage.name,
    valor: d.value,
    responsavel: d.owner.name,
    dias_sem_atividade: Math.floor(
      (Date.now() - new Date(d.activities[0]?.createdAt ?? d.createdAt).getTime()) / 86400000
    ),
  }));
}

async function getMonthlyStats(month: number, year: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const [created, wonDeals, lostDeals] = await Promise.all([
    prisma.deal.count({ where: { createdAt: { gte: start, lt: end } } }),
    prisma.deal.findMany({
      where: { createdAt: { gte: start, lt: end }, stage: { isWon: true } },
      select: { value: true, title: true, contact: { select: { name: true } } },
    }),
    prisma.deal.count({
      where: { createdAt: { gte: start, lt: end }, stage: { isClosed: true, isWon: false } },
    }),
  ]);
  return {
    mes: `${month}/${year}`,
    criados: created,
    ganhos: wonDeals.length,
    valor_ganho: wonDeals.reduce((s, d) => s + d.value, 0),
    perdidos: lostDeals,
    deals_ganhos: wonDeals.map((d) => ({ titulo: d.title, contato: d.contact.name, valor: d.value })),
  };
}

async function searchContacts(query: string) {
  const contacts = await prisma.contact.findMany({
    where: { OR: [{ name: { contains: query } }, { company: { contains: query } }] },
    include: {
      deals: { include: { stage: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 3 },
    },
    take: 10,
  });
  return contacts.map((c) => ({
    nome: c.name,
    empresa: c.company,
    telefone: c.phone,
    email: c.email,
    deals: c.deals.map((d) => ({ titulo: d.title, etapa: d.stage.name, valor: d.value })),
  }));
}

async function getDealsInStage(stageName: string) {
  const deals = await prisma.deal.findMany({
    where: { stage: { name: { contains: stageName } } },
    include: {
      contact: { select: { name: true, company: true } },
      stage: { select: { name: true } },
      owner: { select: { name: true } },
    },
    orderBy: { value: "desc" },
    take: 25,
  });
  return {
    total: deals.length,
    valor_total: deals.reduce((s, d) => s + d.value, 0),
    deals: deals.map((d) => ({
      titulo: d.title,
      contato: d.contact.name,
      empresa: d.contact.company,
      valor: d.value,
      responsavel: d.owner.name,
    })),
  };
}

async function getRecentActivities(limit: number) {
  const activities = await prisma.dealActivity.findMany({
    include: {
      author: { select: { name: true } },
      deal: { include: { contact: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit || 10, 25),
  });
  return activities.map((a) => ({
    data: a.createdAt,
    autor: a.author.name,
    deal: a.deal.title,
    contato: a.deal.contact.name,
    atividade: a.body,
  }));
}

async function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "get_pipeline_summary":   return getPipelineSummary();
    case "get_stalled_deals":      return getStalledDeals(Number(args.days) || 7);
    case "get_monthly_stats":      return getMonthlyStats(Number(args.month), Number(args.year));
    case "search_contacts":        return searchContacts(String(args.query ?? ""));
    case "get_deals_in_stage":     return getDealsInStage(String(args.stage_name ?? ""));
    case "get_recent_activities":  return getRecentActivities(Number(args.limit) || 10);
    default: return { erro: `Ferramenta desconhecida: ${name}` };
  }
}

// ─── Gemini HTTP types ─────────────────────────────────────────────────────────

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

interface GeminiContent {
  role: "user" | "model";
  parts: (
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> } }
    | { functionResponse: { name: string; response: Record<string, unknown> } }
  )[];
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { code: number; message: string; status: string };
}

// ─── Tool declarations ─────────────────────────────────────────────────────────

const FUNCTION_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "get_pipeline_summary",
    description: "Retorna o funil de vendas completo: etapas, quantidade de deals e valor total em cada etapa.",
  },
  {
    name: "get_stalled_deals",
    description: "Retorna deals sem atividade há mais de N dias.",
    parameters: {
      type: "OBJECT",
      properties: { days: { type: "NUMBER", description: "Dias sem atividade (padrão 7)" } },
      required: ["days"],
    },
  },
  {
    name: "get_monthly_stats",
    description: `Estatísticas de deals de um mês. Hoje: ${new Date().toLocaleDateString("pt-BR")}.`,
    parameters: {
      type: "OBJECT",
      properties: {
        month: { type: "NUMBER", description: "Mês (1–12)" },
        year:  { type: "NUMBER", description: "Ano (ex: 2026)" },
      },
      required: ["month", "year"],
    },
  },
  {
    name: "search_contacts",
    description: "Busca contatos por nome ou empresa.",
    parameters: {
      type: "OBJECT",
      properties: { query: { type: "STRING", description: "Texto para buscar" } },
      required: ["query"],
    },
  },
  {
    name: "get_deals_in_stage",
    description: "Lista todos os deals de uma etapa específica do funil.",
    parameters: {
      type: "OBJECT",
      properties: { stage_name: { type: "STRING", description: "Nome ou parte do nome da etapa" } },
      required: ["stage_name"],
    },
  },
  {
    name: "get_recent_activities",
    description: "Retorna as últimas atividades registradas no CRM.",
    parameters: {
      type: "OBJECT",
      properties: { limit: { type: "NUMBER", description: "Quantidade (padrão 10, máximo 25)" } },
      required: ["limit"],
    },
  },
];

const SYSTEM_PROMPT = `Você é o Assistente Comercial da Grafinorte, uma gráfica industrial em Natal/RN.
Use as ferramentas disponíveis para consultar dados reais do CRM antes de responder.
Responda em português, de forma direta e objetiva.
Formate valores em Real (R$) e datas no formato brasileiro (DD/MM/AAAA).
Se não encontrar dados, informe claramente.`;

const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGemini(model: string, apiKey: string, contents: GeminiContent[]): Promise<GeminiResponse> {
  const url = `${GEMINI_BASE}/${model}:generateContent`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools: [{ function_declarations: FUNCTION_DECLARATIONS }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  return res.json() as Promise<GeminiResponse>;
}

// ─── Exported types & main function ───────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export async function runCrmAgent(userMessage: string, history: ChatMessage[]): Promise<string> {
  if (!env.geminiApiKey) throw new HttpError(503, "Chave do Gemini não configurada no servidor.");

  const contents: GeminiContent[] = [
    ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] } as GeminiContent)),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  let lastErr = "";

  for (const model of GEMINI_MODELS) {
    try {
      let response = await callGemini(model, env.geminiApiKey, contents);

      if (response.error) {
        const { code, message } = response.error;
        lastErr = `[${code}] ${message}`;
        console.error(`[CRM Agent] ${model} error:`, lastErr);

        if (code === 401 || code === 403) {
          throw new HttpError(503, `Acesso negado pela API Gemini: ${message}`);
        }
        continue;
      }

      // Agentic loop — max 5 rounds
      for (let round = 0; round < 5; round++) {
        const candidate = response.candidates?.[0];
        if (!candidate) break;

        const funcCalls = candidate.content.parts.filter(
          (p): p is { functionCall: { name: string; args: Record<string, unknown> } } => "functionCall" in p
        );
        if (funcCalls.length === 0) break;

        // Append assistant turn with function calls
        contents.push({ role: "model", parts: candidate.content.parts });

        // Execute tools and append results
        const resultParts = await Promise.all(
          funcCalls.map(async (p) => ({
            functionResponse: {
              name: p.functionCall.name,
              response: { output: JSON.stringify(await executeTool(p.functionCall.name, p.functionCall.args)) },
            },
          }))
        );
        contents.push({ role: "user", parts: resultParts });

        response = await callGemini(model, env.geminiApiKey, contents);

        if (response.error) {
          throw new Error(`[${response.error.code}] ${response.error.message}`);
        }
      }

      const textPart = response.candidates?.[0]?.content?.parts?.find(
        (p): p is { text: string } => "text" in p
      );
      const text = textPart?.text?.trim() ?? "";
      if (text) return text;

    } catch (err: unknown) {
      if (err instanceof HttpError) throw err;
      lastErr = err instanceof Error ? err.message : String(err);
      console.error(`[CRM Agent] ${model} error:`, lastErr);
      continue;
    }
  }

  throw new HttpError(502, `Não foi possível processar a pergunta. Tente novamente. (${lastErr.slice(0, 200)})`);
}
