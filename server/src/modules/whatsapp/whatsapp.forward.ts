import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { sendMediaMessage, uploadMediaToMeta } from "./whatsapp.service";

const MEDIA_DIR = path.join(__dirname, "../../../data/wa-media");
const TEXT_DOCUMENTS: Record<string, string> = { plain: "text/plain", csv: "text/csv" };
const FORWARD_PREFIX = "↪️ ";

/**
 * O banco não guarda o tipo do arquivo; o nome salvo é "<id>.<subtipo>" ("123.jpeg" = image/jpeg).
 * O subtipo pode ter pontos (Word: "123.vnd.openxmlformats-officedocument.wordprocessingml.document").
 */
function mimeFromSaved(mediaType: string, filename: string) {
  const dot = filename.indexOf(".");
  const ext = dot === -1 ? "" : filename.slice(dot + 1);
  if (mediaType === "document") return TEXT_DOCUMENTS[ext] ?? `application/${ext || "octet-stream"}`;
  return `${mediaType}/${ext}`;
}

/** Encaminha o próprio arquivo: sobe de novo pelo número da conversa de destino e envia como mídia */
export async function forwardMediaMessage(targetConversationId: string, sourceMessageId: string, sentById: string) {
  const source = await prisma.waMessage.findUnique({ where: { id: sourceMessageId } });
  if (!source?.mediaType) throw new HttpError(404, "Mensagem de mídia não encontrada.");
  if (source.mediaType === "sticker") throw new HttpError(400, "Figurinhas não podem ser encaminhadas.");
  if (!source.mediaUrl) throw new HttpError(409, "Este arquivo não está salvo na plataforma, então não dá para encaminhar.");

  const savedName = path.basename(source.mediaUrl);
  const buffer = await fs.promises.readFile(path.join(MEDIA_DIR, savedName)).catch(() => {
    throw new HttpError(409, "Este arquivo não está salvo na plataforma, então não dá para encaminhar.");
  });

  const target = await prisma.waConversation.findUnique({ where: { id: targetConversationId } });
  if (!target) throw new HttpError(404, "Conversa de destino não encontrada.");

  const mimetype = mimeFromSaved(source.mediaType, savedName);
  const filename = source.filename ?? savedName;
  const caption = source.text?.startsWith(FORWARD_PREFIX) ? source.text.slice(FORWARD_PREFIX.length) : source.text;

  try {
    const { mediaId, localFilename } = await uploadMediaToMeta(buffer, mimetype, filename, target.phoneNumberId);
    const message = await sendMediaMessage(targetConversationId, mediaId, mimetype, caption || undefined, sentById, localFilename, source.filename);
    return await prisma.waMessage.update({
      where: { id: message.id },
      data: { forwarded: true },
      include: { sentBy: { select: { id: true, name: true, avatarUrl: true } } },
    });
  } catch (err) {
    console.error("[WhatsApp] Falha ao encaminhar mídia:", err);
    throw new HttpError(502, "O WhatsApp não aceitou o arquivo. Ele não foi encaminhado.");
  }
}
