import PDFDocument from "pdfkit";
import type { Response } from "express";
import { COMPANY_LABELS } from "../../utils/companies";
import type { IssuingCompany } from "../../generated/prisma/client";

interface QuoteItemForPdf {
  productName: string;
  specifications: string;
  quantity: number;
  unitPrice: number;
}

export interface QuoteForPdf {
  number: number;
  issuingCompany: IssuingCompany;
  clientName: string;
  clientContact: string | null;
  validUntil: Date | null;
  notes: string | null;
  createdAt: Date;
  createdBy: { name: string };
  items: QuoteItemForPdf[];
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR");
}

const COLS = {
  product: { x: 50, width: 130 },
  specs: { x: 185, width: 190 },
  qty: { x: 380, width: 40 },
  unitPrice: { x: 425, width: 60 },
  total: { x: 490, width: 65 },
};
const PAGE_RIGHT = 555;

function renderQuoteContent(doc: PDFKit.PDFDocument, quote: QuoteForPdf) {
  doc.fontSize(18).font("Helvetica-Bold").text(COMPANY_LABELS[quote.issuingCompany]);
  doc.fontSize(10).font("Helvetica").fillColor("#666").text("Orçamento de produtos gráficos");
  doc.moveDown(1);

  doc.fontSize(14).font("Helvetica-Bold").fillColor("#000").text(`Orçamento Nº ${quote.number}`);
  doc.fontSize(10).font("Helvetica").fillColor("#333");
  doc.text(`Data: ${formatDate(quote.createdAt)}`);
  if (quote.validUntil) doc.text(`Válido até: ${formatDate(quote.validUntil)}`);
  doc.text(`Emitido por: ${quote.createdBy.name}`);
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").text("Cliente: ", { continued: true }).font("Helvetica").text(quote.clientName);
  if (quote.clientContact) {
    doc.font("Helvetica-Bold").text("Contato: ", { continued: true }).font("Helvetica").text(quote.clientContact);
  }
  doc.moveDown(1);

  function drawTableHeader(y: number) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#fff");
    doc.rect(50, y, PAGE_RIGHT - 50, 20).fill("#111111");
    doc.fillColor("#fff");
    doc.text("Produto", COLS.product.x, y + 6, { width: COLS.product.width });
    doc.text("Especificações", COLS.specs.x, y + 6, { width: COLS.specs.width });
    doc.text("Qtd", COLS.qty.x, y + 6, { width: COLS.qty.width });
    doc.text("Unit.", COLS.unitPrice.x, y + 6, { width: COLS.unitPrice.width });
    doc.text("Total", COLS.total.x, y + 6, { width: COLS.total.width });
    return y + 24;
  }

  let y = drawTableHeader(doc.y);
  let grandTotal = 0;

  for (const item of quote.items) {
    const lineTotal = item.quantity * item.unitPrice;
    grandTotal += lineTotal;
    doc.font("Helvetica").fontSize(9).fillColor("#000");
    const specsHeight = doc.heightOfString(item.specifications, { width: COLS.specs.width });
    const nameHeight = doc.heightOfString(item.productName, { width: COLS.product.width });
    const rowHeight = Math.max(specsHeight, nameHeight, 14) + 10;
    if (y + rowHeight > 760) { doc.addPage(); y = drawTableHeader(50); }
    doc.text(item.productName, COLS.product.x, y, { width: COLS.product.width });
    doc.text(item.specifications, COLS.specs.x, y, { width: COLS.specs.width });
    doc.text(String(item.quantity), COLS.qty.x, y, { width: COLS.qty.width });
    doc.text(formatCurrency(item.unitPrice), COLS.unitPrice.x, y, { width: COLS.unitPrice.width });
    doc.text(formatCurrency(lineTotal), COLS.total.x, y, { width: COLS.total.width });
    doc.moveTo(50, y + rowHeight - 5).lineTo(PAGE_RIGHT, y + rowHeight - 5).strokeColor("#e5e5e5").stroke();
    y += rowHeight;
  }

  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(12)
    .text(`Total geral: ${formatCurrency(grandTotal)}`, 50, y + 10, { width: PAGE_RIGHT - 50, align: "right" });

  if (quote.notes) {
    doc.moveDown(2);
    doc.font("Helvetica-Bold").fontSize(10).text("Observações:");
    doc.font("Helvetica").fontSize(9).text(quote.notes, { width: PAGE_RIGHT - 50 });
  }
}

export function generateQuotePdfBuffer(quote: QuoteForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    renderQuoteContent(doc, quote);
    doc.end();
  });
}

export function streamQuotePdf(quote: QuoteForPdf, res: Response) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="orcamento-${quote.number}.pdf"`);
  doc.pipe(res);
  renderQuoteContent(doc, quote);
  doc.end();
}
