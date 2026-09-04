import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";

export interface ProposalItem {
  numero: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  melhorCusto: boolean;
}

export interface ExtractedProposal {
  numeroOrcamento: string;
  clienteNome: string;
  clienteContato: string;
  data: string;
  tituloProduto: string;
  especificacoes: string;
  itens: ProposalItem[];
  condicoes: string;
  observacoes: string;
  vendedor: string;
  orcamentista: string;
  responsavel: string;
  _method?: "local" | "ai";
}

const EXTRACT_PROMPT = `Extraia os dados deste orçamento/proposta comercial da Grafinorte e retorne SOMENTE um JSON válido (sem markdown, sem texto extra) com esta estrutura exata:

{
  "numeroOrcamento": "",
  "clienteNome": "",
  "clienteContato": "",
  "data": "",
  "tituloProduto": "",
  "especificacoes": "",
  "itens": [
    {
      "numero": "01",
      "quantidade": "",
      "valorUnitario": "",
      "valorTotal": "",
      "melhorCusto": false
    }
  ],
  "condicoes": "",
  "observacoes": "",
  "vendedor": "",
  "orcamentista": "",
  "responsavel": ""
}

Regras:
- numeroOrcamento: número da proposta/orçamento (ex: "186160")
- clienteNome: nome do cliente ou empresa destinatária
- clienteContato: telefone do cliente
- data: data no formato DD/MM/AAAA (ex: "07/07/2026")
- tituloProduto: nome do produto/serviço principal (ex: "Envelope 11 × 16 cm")
- especificacoes: especificações técnicas separadas por " · " (ex: "Med. aberta: 200×267mm · Papel: Offset 120g · Acabamento: Faca Interna, Corte/Vinco, Shrink")
- itens: cada opção de quantidade/preço é um item separado
  - numero: "01", "02", "03"...
  - quantidade: número + tipo (ex: "1.000 Envelopes PB 11×16cm")
  - valorUnitario: com "R$" (ex: "R$ 1,24")
  - valorTotal: com "R$" (ex: "R$ 1.240,00")
  - melhorCusto: true se marcado como melhor custo/unidade
- condicoes: condições separadas por \\n
- observacoes: texto de observações/avisos legais
- vendedor, orcamentista, responsavel: nomes no rodapé
- Use "" para campos não encontrados
- Retorne APENAS o JSON`;

export async function extractFromDocument(
  fileBase64: string,
  mimeType: string,
): Promise<ExtractedProposal> {
  if (!env.geminiApiKey) {
    throw new HttpError(503, "Chave do Gemini não configurada no servidor.");
  }

  const genAI = new GoogleGenerativeAI(env.geminiApiKey);

  const MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
  ];

  let result;
  let lastMsg = "";

  for (const modelName of MODELS) {
    const model = genAI.getGenerativeModel(
      { model: modelName },
      { apiVersion: "v1beta" }
    );
    try {
      result = await model.generateContent([
        { inlineData: { data: fileBase64, mimeType } },
        { text: EXTRACT_PROMPT },
      ]);
      break; // funcionou — sai do loop
    } catch (err: unknown) {
      lastMsg = err instanceof Error ? err.message : String(err);
      const isRetryable = lastMsg.includes("503") || lastMsg.includes("overloaded") || lastMsg.includes("high demand") || lastMsg.includes("unavailable");
      if (isRetryable) {
        await new Promise(r => setTimeout(r, 2000));
        continue; // tenta o próximo modelo
      }
      throw new HttpError(502, `Erro Gemini: ${lastMsg}`);
    }
  }

  if (!result) throw new HttpError(502, `Gemini indisponível em todos os modelos: ${lastMsg}`);

  const text = result.response.text();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new HttpError(502, "Gemini não retornou JSON válido.");

  return { ...(JSON.parse(match[0]) as ExtractedProposal), _method: "ai" };
}
