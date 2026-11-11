import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { HttpError } from "../../middleware/errorHandler";

// PDFs das notas fiscais (DANFE). Fora do Git: têm dados de clientes.
export const INVOICE_DIR = path.join(__dirname, "../../../data/pcp-notas");
const MAX_BYTES = 15 * 1024 * 1024;
const STORED_NAME = /^[a-f0-9]{32}\.pdf$/;

export interface InvoiceFile { stored: string; name: string }

/** Confere que é PDF e grava com nome aleatório; devolve o nome guardado e o nome original */
export async function saveInvoicePdf(raw: unknown, originalName: unknown): Promise<InvoiceFile> {
  if (typeof raw !== "string" || !raw) throw new HttpError(400, "Anexe o PDF da nota.");
  const buffer = Buffer.from(raw.replace(/^data:[^,]*,/, ""), "base64");
  if (buffer.length > MAX_BYTES) throw new HttpError(400, "PDF da nota muito grande. O limite é 15 MB.");
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(400, "O arquivo da nota precisa ser um PDF.");
  await fs.promises.mkdir(INVOICE_DIR, { recursive: true });
  const stored = crypto.randomBytes(16).toString("hex") + ".pdf";
  await fs.promises.writeFile(path.join(INVOICE_DIR, stored), buffer);
  const name = typeof originalName === "string" && originalName.trim() ? path.basename(originalName.trim()).slice(0, 120) : "nota.pdf";
  return { stored, name };
}

/** Apaga um PDF gravado quando a operação que o usaria falhou */
export async function discardInvoicePdf(file: InvoiceFile | null) {
  if (file && STORED_NAME.test(file.stored)) await fs.promises.unlink(path.join(INVOICE_DIR, file.stored)).catch(() => {});
}

export function invoicePdfPath(stored: string) {
  if (!STORED_NAME.test(stored)) throw new HttpError(404, "Arquivo não encontrado.");
  const full = path.join(INVOICE_DIR, stored);
  if (!fs.existsSync(full)) throw new HttpError(404, "O PDF desta nota não está mais no servidor.");
  return full;
}
