import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";

export interface CompetitorInsight {
  competitor: string;
  summary: string;
  postFrequency: string;
  contentThemes: string[];
  topPerformingContent: string;
  estimatedEngagement: string;
  recentHighlights: string[];
  recommendations: string[];
  warnings: string[];
  analyzedAt: string;
}

const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];

// ─── Gemini + Google Search ───────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  if (!env.geminiApiKey) throw new Error("GEMINI_API_KEY não configurada no servidor");

  const genAI = new GoogleGenerativeAI(env.geminiApiKey);

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel(
        { model: modelName, tools: [{ googleSearch: {} } as never] },
        { apiVersion: "v1beta" }
      );

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      return result.response.text();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes("503") || msg.includes("overloaded") ||
        msg.includes("high demand") || msg.includes("unavailable");
      if (isRetryable) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      if (msg.includes("401") || msg.includes("403")) {
        throw new Error("Chave do Gemini inválida ou sem permissão.");
      }
      // try next model
      continue;
    }
  }

  throw new Error("Gemini indisponível após todas as tentativas.");
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export async function analyzeCompetitor(handle: string, niche: string): Promise<CompetitorInsight> {
  const nicheLabel = niche === "grafinorte"
    ? "indústria gráfica, impressão e gráfica rápida no Brasil"
    : "embalagens, packaging e soluções em embalagens no Brasil";

  const prompt = `Você é especialista em marketing digital para o setor de ${nicheLabel}.

Pesquise no Google e analise o perfil do Instagram @${handle} (concorrente do setor de ${nicheLabel}).

Busque e analise:
1. Perfil do Instagram @${handle}: seguidores, bio, tipo de conteúdo
2. Posts recentes das últimas 2-4 semanas: temas, formatos (foto/reels/stories), frequência
3. Tipos de conteúdo com mais curtidas e comentários
4. Estratégia de comunicação, hashtags usadas e estilo visual
5. O que diferencia esse concorrente e o que fazem bem nas redes sociais

Baseado na pesquisa, retorne APENAS um JSON válido (sem markdown, sem texto antes ou depois) com esta estrutura:
{
  "competitor": "@${handle}",
  "summary": "Resumo em 2-3 frases da estratégia e posicionamento da conta",
  "postFrequency": "ex: 3-4 posts por semana",
  "contentThemes": ["tema1", "tema2", "tema3", "tema4"],
  "topPerformingContent": "Descrição do que tem mais engajamento no perfil deles",
  "estimatedEngagement": "ex: ~2.5% (estimativa baseada em curtidas/seguidores)",
  "recentHighlights": ["destaque1 recente", "destaque2 recente", "destaque3 recente"],
  "recommendations": ["Recomendação 1 concreta para melhorar nosso Instagram", "Recomendação 2", "Recomendação 3", "Recomendação 4"],
  "warnings": ["Ponto de atenção 1: algo que eles fazem bem que precisamos melhorar urgente", "Ponto de atenção 2"],
  "analyzedAt": "${new Date().toISOString()}"
}`;

  const text = await callGemini(prompt);

  // Extract JSON from response (Gemini sometimes adds markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as CompetitorInsight;
      return parsed;
    } catch {
      // fall through to fallback
    }
  }

  // Fallback: structure from raw text
  return {
    competitor: `@${handle}`,
    summary: text.slice(0, 400).trim(),
    postFrequency: "Não identificado",
    contentThemes: ["Conteúdo do setor"],
    topPerformingContent: "Ver análise completa acima",
    estimatedEngagement: "Não calculado",
    recentHighlights: [],
    recommendations: ["Analisar o perfil manualmente no Instagram"],
    warnings: [],
    analyzedAt: new Date().toISOString(),
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listProfiles() {
  return prisma.competitorProfile.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      reports: {
        orderBy: { generatedAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function addProfile(handle: string, name: string, niche: string) {
  return prisma.competitorProfile.upsert({
    where: { handle_niche: { handle, niche } },
    update: { name },
    create: { handle, name, niche },
  });
}

export async function removeProfile(id: string) {
  return prisma.competitorProfile.delete({ where: { id } });
}

export async function getLatestReport(profileId: string) {
  return prisma.competitorReport.findFirst({
    where: { profileId },
    orderBy: { generatedAt: "desc" },
  });
}

export async function getReportHistory(profileId: string) {
  return prisma.competitorReport.findMany({
    where: { profileId },
    orderBy: { generatedAt: "desc" },
    take: 10,
  });
}

export async function runAnalysisForProfile(profileId: string): Promise<void> {
  const profile = await prisma.competitorProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw new Error("Perfil não encontrado");

  if (!env.geminiApiKey) throw new Error("GEMINI_API_KEY não configurada — adicione no .env do servidor");

  console.log(`[Competitor] Analisando @${profile.handle} com Gemini + Google Search...`);
  const insight = await analyzeCompetitor(profile.handle, profile.niche);

  await prisma.competitorReport.create({
    data: {
      profileId,
      analysis: JSON.stringify(insight),
    },
  });
  console.log(`[Competitor] Análise concluída: @${profile.handle}`);
}

// ─── Daily scheduler ──────────────────────────────────────────────────────────

export function startCompetitorScheduler() {
  if (!env.geminiApiKey) {
    console.log("  [Competitor] GEMINI_API_KEY não configurada — agendador desativado");
    return;
  }

  async function runDailyAnalysis() {
    const profiles = await prisma.competitorProfile.findMany();
    if (profiles.length === 0) return;

    console.log(`[Competitor] Análise diária — ${profiles.length} concorrente(s)`);
    for (const profile of profiles) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const existing = await prisma.competitorReport.findFirst({
        where: { profileId: profile.id, generatedAt: { gte: todayStart } },
      });
      if (existing) { console.log(`[Competitor] @${profile.handle} já analisado hoje — pulando`); continue; }

      try {
        await runAnalysisForProfile(profile.id);
      } catch (err) {
        console.error(`[Competitor] Erro ao analisar @${profile.handle}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Run 45s after startup so server is fully ready
  setTimeout(() => { runDailyAnalysis().catch(console.error); }, 45_000);

  // Then every 24h
  setInterval(() => { runDailyAnalysis().catch(console.error); }, 24 * 60 * 60 * 1000);

  console.log("  [Competitor] Agendador de análise diária de concorrentes iniciado (Gemini + Google Search).");
}
