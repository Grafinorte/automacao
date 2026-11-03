import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";
import { INK_COLORS } from "./colorProof.service";

// Leitura de números exige o modelo mais forte primeiro; o leve fica de reserva
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// A IA só LÊ o painel; as contas de custo são feitas pelo servidor (computeCost)
const SYSTEM_PROMPT = `Você é o assistente de custos da prova de cor da Grafinorte/Pluspack.
Recebe FOTOS do painel da impressora Canon imagePROGRAF PRO-2600 (tela "Exibir histórico trabalho")
e devolve SOMENTE os números lidos, em JSON. Precisão é obrigatória: zero chute.
Se um número estiver borrado, cortado, com reflexo ou ambíguo, deixe o campo null e explique em "illegible".
Nunca deduza nem calcule um número que não aparece na foto.

O QUE EXTRAIR DE CADA TRABALHO (procure estas telas):
1. Papel consumido → em m² (a máquina mostra em pés² e em m²; use SEMPRE o m²). Campo paperM2.
2. Comprimento do papel → mm (campo lengthMm, opcional). Se o painel mostrar só em polegadas ("pol"), deixe lengthMm null
   e coloque o valor em polegadas em lengthIn.
3. Largura do papel → mm (campo widthMm). O painel costuma mostrar SÓ em polegadas (ex.: "24.00 pol"): nesse caso
   deixe widthMm null e coloque o número em polegadas em widthIn. Não converta unidades.
4. Total de tinta consumido → ml (campo inkMl).
5. Consumo de tinta por cor → as 12 cores em ml: PM, R, C, PGY, MBK, PBK, B, CO, GY, Y, M, PC.
   Cor que não aparece em nenhuma foto = null (não é zero). Zero só se o painel mostrar 0.
6. Nome do documento / OS / cliente (tela "Nome do documento") → campo label; null se não aparecer.
7. Data do trabalho: use "Início da impressão". ATENÇÃO: o painel mostra no formato americano MÊS/DIA/ANO
   (ex.: "10/28/2026 08:37:25" = 28 de outubro de 2026). Devolva em date no formato AAAA-MM-DD; null se não aparecer.

VÁRIAS FOTOS:
- Várias fotos podem ser do MESMO trabalho (telas diferentes: papel, tinta, cores, nome). Junte tudo num item só.
- Se as fotos forem de trabalhos diferentes (nomes de documento diferentes), devolva um item por trabalho em "jobs".
- Se não der para saber a qual trabalho cada foto pertence, devolva o que conseguir e pergunte em "questions"
  pedindo o de-para "CLIENTE/OS → papel (m²) → tinta (ml)".

VALIDAÇÃO (só informe, não corrija):
- Se você leu as 12 cores e a soma não bate com o total de tinta, diga em "illegible" do trabalho que as cores
  parecem incompletas (painel cortado) — mesmo assim devolva o total lido.

Números: o painel mostra zeros à esquerda (ex.: "00000.597" = 0.597; "000.057" = 0.057). Use ponto como separador
decimal no JSON (ex.: 0.412). Não arredonde: copie as casas que aparecem.
A mesma informação pode aparecer em mais de uma foto (a tela rola): é o mesmo trabalho, não some duas vezes.
Ignore reflexos de luz e ícones sobrepostos (setas, botão "Parar"); se cobrirem um dígito, marque como ilegível.
Escreva "illegible" e "questions" em português, curtos e diretos para o operador.`;

const colorProps = Object.fromEntries(INK_COLORS.map((c) => [c, { type: "number", nullable: true }]));

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    jobs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string", nullable: true },
          date: { type: "string", nullable: true },
          paperM2: { type: "number", nullable: true },
          inkMl: { type: "number", nullable: true },
          widthMm: { type: "number", nullable: true },
          lengthMm: { type: "number", nullable: true },
          widthIn: { type: "number", nullable: true },
          lengthIn: { type: "number", nullable: true },
          inkByColor: { type: "object", properties: colorProps },
          illegible: { type: "array", items: { type: "string" } },
        },
        required: ["label", "paperM2", "inkMl", "inkByColor", "illegible"],
      },
    },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["jobs", "questions"],
};

export interface PanelJob {
  label: string | null;
  date: string | null;
  paperM2: number | null;
  inkMl: number | null;
  widthMm: number | null;
  lengthMm: number | null;
  inkByColor: Record<string, number | null>;
  illegible: string[];
}

function parseImage(dataUrl: unknown) {
  const m = typeof dataUrl === "string" ? dataUrl.match(/^data:(image\/(?:jpeg|png|webp|heic|heif));base64,(.+)$/) : null;
  if (!m) throw new HttpError(400, "Envie as fotos em JPG, PNG ou WEBP.");
  if ((m[2].length * 3) / 4 > MAX_IMAGE_BYTES) throw new HttpError(400, "Uma das fotos é grande demais (máximo 8 MB).");
  return { inline_data: { mime_type: m[1], data: m[2] } };
}

const inchesToMm = (v: unknown) => { const n = num(v); return n === null ? null : Math.round(n * 25.4 * 10) / 10; };
const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);

export async function readPanelPhotos(images: unknown[]): Promise<{ jobs: PanelJob[]; questions: string[]; model: string }> {
  if (!env.geminiApiKey) {
    throw new HttpError(503, "A leitura por IA ainda não foi configurada. Peça ao administrador para adicionar a GEMINI_API_KEY no servidor.");
  }
  if (!Array.isArray(images) || images.length === 0) throw new HttpError(400, "Envie ao menos uma foto do painel.");
  if (images.length > MAX_IMAGES) throw new HttpError(400, `Envie no máximo ${MAX_IMAGES} fotos por vez.`);
  const parts = [
    ...images.map(parseImage),
    { text: `São ${images.length} foto(s) do painel "Exibir histórico trabalho". Leia e devolva o JSON.` },
  ];

  let lastError = "";
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiApiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message: string } };
      if (data.error) {
        lastError = data.error.message;
        console.warn(`[Teste de cor] ${model} falhou:`, lastError);
        continue;
      }
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const parsed = JSON.parse(text) as { jobs?: (Partial<PanelJob> & { widthIn?: number; lengthIn?: number })[]; questions?: string[] };
      const jobs = (parsed.jobs ?? []).map((j) => ({
        label: typeof j.label === "string" && j.label.trim() ? j.label.trim() : null,
        date: typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null,
        paperM2: num(j.paperM2), inkMl: num(j.inkMl),
        // Painel em polegadas: a conversão para mm é feita aqui, não pela IA
        widthMm: num(j.widthMm) ?? inchesToMm(j.widthIn), lengthMm: num(j.lengthMm) ?? inchesToMm(j.lengthIn),
        inkByColor: Object.fromEntries(INK_COLORS.map((c) => [c, num(j.inkByColor?.[c])])),
        illegible: Array.isArray(j.illegible) ? j.illegible.filter((s) => typeof s === "string" && s.trim()) : [],
      }));
      return { jobs, questions: (parsed.questions ?? []).filter((q) => typeof q === "string" && q.trim()), model };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`[Teste de cor] ${model} falhou:`, lastError);
    }
  }
  console.error("[Teste de cor] Falha na leitura por IA:", lastError);
  throw new HttpError(502, "Não consegui ler as fotos agora. Tente de novo em instantes ou lance os números à mão.");
}
