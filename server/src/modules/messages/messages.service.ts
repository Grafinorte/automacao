import { prisma } from "../../db/prisma";
import { saveAttachment } from "../../utils/attachmentStorage";
import { createNotification } from "../notifications/notifications.service";

export async function listConversations(userId: string) {
  const users = await prisma.user.findMany({
    where: { isActive: true, id: { not: userId } },
    select: { id: true, name: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });

  const conversations = await Promise.all(
    users.map(async (other) => {
      const [lastMessage, unreadCount] = await Promise.all([
        prisma.message.findFirst({
          where: {
            OR: [
              { senderId: userId, recipientId: other.id },
              { senderId: other.id, recipientId: userId },
            ],
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.message.count({
          where: { senderId: other.id, recipientId: userId, readAt: null },
        }),
      ]);
      return {
        user: other,
        lastMessage: lastMessage
          ? { body: lastMessage.body, createdAt: lastMessage.createdAt, fromMe: lastMessage.senderId === userId }
          : null,
        unreadCount,
      };
    })
  );

  conversations.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt.getTime() ?? 0;
    const bTime = b.lastMessage?.createdAt.getTime() ?? 0;
    return bTime - aTime;
  });

  return conversations;
}

export function getThread(userId: string, otherUserId: string) {
  return prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId, recipientId: otherUserId },
        { senderId: otherUserId, recipientId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      attachments: {
        select: { id: true, fileName: true, fileUrl: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function sendMessage(
  senderId: string,
  recipientId: string,
  body: string,
  attachments?: { fileUrl: string; fileName: string }[]
) {
  const msg = await prisma.message.create({
    data: {
      senderId,
      recipientId,
      body,
      attachments: attachments?.length
        ? { create: attachments.map((a) => ({ fileName: a.fileName, fileUrl: a.fileUrl })) }
        : undefined,
    },
    include: {
      attachments: { select: { id: true, fileName: true, fileUrl: true } },
      sender: { select: { name: true } },
    },
  });

  createNotification(
    recipientId,
    "new_message",
    `Nova mensagem de ${msg.sender.name}`,
    body.length > 80 ? body.slice(0, 80) + "…" : body,
    `/chat/${senderId}`
  ).catch(() => {});

  return msg;
}

export function uploadMessageFile(senderId: string, dataUrl: string, fileName: string) {
  const fileUrl = saveAttachment("messages", senderId, dataUrl);
  return { fileUrl, fileName };
}

export async function markThreadRead(userId: string, otherUserId: string) {
  await prisma.message.updateMany({
    where: { senderId: otherUserId, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export function countUnread(userId: string) {
  return prisma.message.count({ where: { recipientId: userId, readAt: null } });
}
