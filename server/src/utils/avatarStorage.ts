import fs from "node:fs";
import path from "node:path";
import { HttpError } from "../middleware/errorHandler";

const AVATARS_DIR = path.join(__dirname, "../../data/avatars");
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function saveAvatarFromDataUrl(userId: string, dataUrl: string): string {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new HttpError(400, "Formato de imagem inválido. Use PNG, JPEG ou WEBP.");
  }
  const [, mimeType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_BYTES) {
    throw new HttpError(400, "A imagem é muito grande (máximo 2MB).");
  }

  fs.mkdirSync(AVATARS_DIR, { recursive: true });
  const extension = ALLOWED_TYPES[mimeType];
  const fileName = `${userId}.${extension}`;
  fs.writeFileSync(path.join(AVATARS_DIR, fileName), buffer);

  return `/avatars/${fileName}?v=${Date.now()}`;
}
