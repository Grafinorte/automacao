// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

import type { ExtractedProposal, ProposalItem } from "./proposal.service";

// ─── Extração de texto ────────────────────────────────────────────────────────

export async function extractTextFromFile(
  fileBase64: string,
  mimeType: string
): Promise<string> {
  const buffer = Buffer.from(fileBase64, "base64");

  if (mimeType === "application/pdf") {
    const data = await pdfParse(buffer);
    return data.text;
  }

  // Imagens: Tesseract OCR (carregado dinamicamente)
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("por+eng");
    try {
      const { data } = await worker.recognize(buffer);
      return data.text;
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`OCR falhou: ${msg}. Tente enviar um PDF.`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function fmtPrice(raw: string): string {
  // "1.240,00" → "R$ 1.240,00"
  const s = raw.replace(/R\$\s*/g, "").trim();
  return `R$ ${s}`;
}

// ─── Parser do formato interno Grafinorte ─────────────────────────────────────
// Formato: À [cliente]\nTel: ...\nApucarana DD/MM/AAAA NNNNNN.\n[itens]\n[condições]\nVendedor ...

export function parseGrafinorteOrcamento(text: string): Partial<ExtractedProposal> {
  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // ── 1. Cliente ──────────────────────────────────────────────────────────────
  const clienteNome = clean(
    t.match(/^À\s+(.+?)(?=\n|At\.|$)/m)?.[1] ??
    t.match(/À\s+(.{3,80}?)(?=\n)/)?.[1] ?? ""
  );

  // ── 2. Contato ──────────────────────────────────────────────────────────────
  const clienteContato = clean(
    t.match(/Tel:\s*([\(\d\)\s\-\.]+?)(?=\s*Cel|\s*\n)/)?.[1] ??
    t.match(/(\(\d{2}\)\s*\d{4,5}[\s\-\.]\d{4})/)?.[1] ?? ""
  );

  // ── 3. Data e número: "Apucarana 07/07/2026 186160." ───────────────────────
  const header = t.match(/Apucarana\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{4,7})\./);
  const data = header?.[1] ?? "";
  const numeroOrcamento = header?.[2] ?? "";

  // ── 4. Itens ────────────────────────────────────────────────────────────────
  // Cada item começa com "NNNNNN.NN  QTY UNIDADE - PRODUTO"
  // e termina com "Unit: X  Total : R$ Y  Pgto: ..."
  const itens: ProposalItem[] = [];
  let especificacoesRaw = "";

  const itemPattern = /\d+\.(\d{2})\s+([\d.]+)\s+(\w+)\s+-\s+(.+?)\n([\s\S]*?)Unit:\s*([\d,]+)\s+Total\s*:\s*R\$\s*([\d.,]+)/g;

  for (const m of t.matchAll(itemPattern)) {
    const numero    = m[1];                             // "01"
    const qtyStr    = m[2];                             // "1.000"
    const unitType  = m[3];                             // "Envelope"
    const prodName  = clean(m[4].split(" - ")[0]);      // "ENVELOPE PB 11 X 16 CM"
    const specBlock = m[5];                             // linhas de especificação
    const unitPrice = m[6];                             // "1,24"
    const totalRaw  = m[7];                             // "1.240,00"

    // Extrai specs do primeiro item
    if (!especificacoesRaw && specBlock) {
      const medAberta = specBlock.match(/MED\.ABERTA:\s*([^\n,]+)/i)?.[1]?.trim();
      const papel     = specBlock.match(/em\s+Papel\s+(.+?)[.\n]/i)?.[1]?.trim();
      const acabMatch = specBlock.match(/Faca[^.]*\./i)?.[0]?.trim().replace(/\.$/, "");

      const parts: string[] = [];
      if (medAberta) parts.push(`Med. aberta: ${medAberta.replace(/x/gi, "×")}`);
      if (papel)     parts.push(`Papel: ${papel}`);
      if (acabMatch) parts.push(`Acabamento: ${acabMatch}`);

      especificacoesRaw = parts.join(" · ");
    }

    // Quantidade para exibição: "1.000 Envelopes PB"
    const displayType  = unitType.charAt(0).toUpperCase() + unitType.slice(1).toLowerCase() + "s";
    const shortName    = prodName.replace(/\(.*?\)/g, "").trim();
    const quantidade   = `${qtyStr} ${displayType} ${shortName}`;

    itens.push({
      numero,
      quantidade: clean(quantidade),
      valorUnitario: fmtPrice(unitPrice),
      valorTotal: fmtPrice(totalRaw),
      melhorCusto: /MELHOR CUSTO/i.test(m[0]),
    });
  }

  // ── 5. Título: derivado dos itens ──────────────────────────────────────────
  let tituloProduto = "";
  if (itens.length === 1) {
    // Ex: "1.000 Envelopes ENVELOPE PB 11 X 16 CM" → título = "Envelope PB 11 × 16 cm"
    tituloProduto = itens[0].quantidade.split(" ").slice(1).join(" ").replace(/x/gi, "×");
  } else if (itens.length > 1) {
    // Tenta encontrar a parte comum dos produtos (ex: "Envelope 11 × 16 cm")
    // Simples: usa o tipo do primeiro item + dimensões se tiver
    const dim = itens[0].quantidade.match(/(\d+\s*[×xX]\s*\d+)/)?.[1] ?? "";
    const type = itens[0].quantidade.split(" ")[1] ?? "";
    tituloProduto = dim ? `${type} ${dim.replace(/x/gi, "×")} cm` : type;
  }

  // ── 6. Condições ───────────────────────────────────────────────────────────
  const conds: string[] = [];

  // Pgto (pega o do primeiro item pois pode variar, ou extrai do rodapé)
  const pgtoMatch = t.match(/Pgto:\s*([^\n]+)/i);
  if (pgtoMatch) conds.push(`Pagamento: ${clean(pgtoMatch[1])}`);

  if (/ARTE FORNECIDA PELO CLIENTE/i.test(t)) conds.push("Arte fornecida pelo cliente");

  const entrega = t.match(/-ENTREGA\s+(?:EM\s+)?(.+)/i);
  if (entrega) conds.push(`Entrega em ${clean(entrega[1])}`);

  const validade = t.match(/Validade da proposta\s*:\s*(.+?)(?=\n|$)/i);
  if (validade) conds.push(`Validade da proposta: ${clean(validade[1])}`);

  // ── 7. Observações (texto jurídico) ────────────────────────────────────────
  const obsMatch = t.match(/(?:Não revisamos|Nao revisamos)([\s\S]+?)(?=Vendedor|Orçamentista|$)/i);
  const observacoes = obsMatch
    ? clean("Não revisamos" + obsMatch[1])
        .replace(/\s*;\s*/g, ";\n")
        .trim()
    : "";

  // ── 8. Equipe ───────────────────────────────────────────────────────────────
  const vendedor     = clean(t.match(/Vendedor\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/)?.[1] ?? "");
  const orcamentista = clean(t.match(/Orçamentista:?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i)?.[1] ?? "");
  const responsavel  = clean(t.match(/Responsável:?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)/i)?.[1] ?? "");

  return {
    numeroOrcamento,
    clienteNome,
    clienteContato,
    data,
    tituloProduto: clean(tituloProduto),
    especificacoes: especificacoesRaw,
    itens: itens.length > 0 ? itens : [{ numero: "01", quantidade: "", valorUnitario: "", valorTotal: "", melhorCusto: false }],
    condicoes: conds.join("\n"),
    observacoes,
    vendedor,
    orcamentista,
    responsavel,
  };
}
