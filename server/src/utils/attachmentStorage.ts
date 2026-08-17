import fs from "node:fs";
import path from "node:path";
import { HttpError } from "../middleware/errorHandler";

const ATTACHMENTS_DIR = path.join(__dirname, "../../data/attachments");
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "image/gif": "gif", "application/pdf": "pdf",
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3",
  "audio/mp4": "m4a", "audio/wav": "wav", "audio/aac": "aac",
  "video/mp4": "mp4", "video/webm": "webm",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt", "application/zip": "zip",
  "application/x-rar-compressed": "rar",
};

function mimeToExt(mimeType: string): string {
  if (MIME_TO_EXT[mimeType]) return MIME_TO_EXT[mimeType];
  const sub = mimeType.split("/")[1];
  return sub ? sub.replace(/[^a-z0-9]/g, "").slice(0, 8) : "bin";
}

export function saveAttachment(category: string, entityId: string, dataUrl: string): string {
  const match = /^data:([\w./+;=-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new HttpError(400, "Formato de arquivo inválido.");
  const [, mimeType, base64] = match;
  const ext = mimeToExt(mimeType);
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_BYTES) throw new HttpError(400, "Arquivo muito grande (máx. 100 MB).");
  const dir = path.join(ATTACHMENTS_DIR, category, entityId);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return `/attachments/${category}/${entityId}/${fileName}`;
}

export function deleteAttachmentFile(fileUrl: string) {
  const relative = fileUrl.replace(/^\/attachments\//, "");
  const full = path.join(ATTACHMENTS_DIR, relative);
  if (full.startsWith(ATTACHMENTS_DIR) && fs.existsSync(full)) {
    fs.unlinkSync(full);
  }
}
