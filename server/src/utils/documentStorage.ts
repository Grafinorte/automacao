import fs from "node:fs";
import path from "node:path";
import { HttpError } from "../middleware/errorHandler";

const DOCUMENTS_DIR = path.join(__dirname, "../../data/hr-documents");
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function saveDocumentFromDataUrl(employeeId: string, dataUrl: string): string {
  const match = /^data:([\w./+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new HttpError(400, "Formato de arquivo inválido.");
  }
  const [, mimeType, base64] = match;
  const extension = ALLOWED_TYPES[mimeType];
  if (!extension) {
    throw new HttpError(400, "Use um arquivo PNG, JPEG, WEBP ou PDF.");
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_BYTES) {
    throw new HttpError(400, "O arquivo é muito grande (máximo 6MB).");
  }

  const employeeDir = path.join(DOCUMENTS_DIR, employeeId);
  fs.mkdirSync(employeeDir, { recursive: true });
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  fs.writeFileSync(path.join(employeeDir, fileName), buffer);

  return `/hr-documents/${employeeId}/${fileName}`;
}

export function deleteDocumentFile(fileUrl: string) {
  const relative = fileUrl.replace(/^\/hr-documents\//, "");
  const fullPath = path.join(DOCUMENTS_DIR, relative);
  if (fullPath.startsWith(DOCUMENTS_DIR) && fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}
