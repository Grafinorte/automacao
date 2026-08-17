import { prisma } from "../../db/prisma";
import { createNotification } from "../notifications/notifications.service";

const MEMBER_SELECT = {
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export async function listGroupChats(userId: string) {
  return prisma.groupChat.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      createdById: true,
      members: { select: MEMBER_SELECT },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, body: true, createdAt: true, senderId: true },
      },
    },
  });
}

export async function createGroupChat(name: string, creatorId: string, memberIds: string[]) {
  const allIds = Array.from(new Set([creatorId, ...memberIds]));
  return prisma.groupChat.create({
    data: {
      name,
      createdById: creatorId,
      members: { create: allIds.map((userId) => ({ userId })) },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      createdById: true,
      members: { select: MEMBER_SELECT },
      messages: { take: 0, select: { id: true } },
    },
  });
}

export async function getGroupChat(groupChatId: string, userId: string) {
  const group = await prisma.groupChat.findUnique({
    where: { id: groupChatId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      createdById: true,
      members: { select: MEMBER_SELECT },
    },
  });
  if (!group) return null;
  const isMember = group.members.some((m) => m.user.id === userId);
  if (!isMember) return null;
  return group;
}

export async function addGroupMember(groupChatId: string, userId: string) {
  await prisma.groupChatMember.upsert({
    where: { groupChatId_userId: { groupChatId, userId } },
    create: { groupChatId, userId },
    update: {},
  });
  return getGroupChatById(groupChatId);
}

export async function removeGroupMember(groupChatId: string, userId: string) {
  await prisma.groupChatMember.delete({
    where: { groupChatId_userId: { groupChatId, userId } },
  });
  return getGroupChatById(groupChatId);
}

export async function deleteGroupChat(id: string) {
  return prisma.groupChat.delete({ where: { id } });
}

export async function getGroupMessages(groupChatId: string, userId: string) {
  const isMember = await prisma.groupChatMember.findUnique({
    where: { groupChatId_userId: { groupChatId, userId } },
  });
  if (!isMember) return null;

  return prisma.groupMessage.findMany({
    where: { groupChatId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      senderId: true,
      sender: { select: { id: true, name: true, avatarUrl: true } },
      attachments: { select: { id: true, fileName: true, fileUrl: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

export async function sendGroupMessage(
  groupChatId: string,
  senderId: string,
  body: string,
  attachments?: { fileUrl: string; fileName: string }[]
) {
  const isMember = await prisma.groupChatMember.findUnique({
    where: { groupChatId_userId: { groupChatId, userId: senderId } },
  });
  if (!isMember) throw new Error("Não é membro do grupo");

  const msg = await prisma.groupMessage.create({
    data: {
      groupChatId,
      senderId,
      body,
      attachments: attachments?.length
        ? { create: attachments.map((a) => ({ fileName: a.fileName, fileUrl: a.fileUrl })) }
        : undefined,
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      senderId: true,
      sender: { select: { id: true, name: true, avatarUrl: true } },
      attachments: { select: { id: true, fileName: true, fileUrl: true } },
    },
  });

  // Notify other members
  const members = await prisma.groupChatMember.findMany({
    where: { groupChatId, NOT: { userId: senderId } },
    select: { userId: true },
  });
  const group = await prisma.groupChat.findUnique({ where: { id: groupChatId }, select: { name: true } });
  const senderUser = await prisma.user.findUnique({ where: { id: senderId }, select: { name: true } });

  for (const m of members as { userId: string }[]) {
    createNotification(
      m.userId,
      "NEW_MESSAGE",
      `${senderUser?.name ?? "Alguém"} em ${group?.name ?? "grupo"}`,
      body.length > 80 ? body.slice(0, 80) + "…" : body,
      `/chat/group/${groupChatId}`
    ).catch(() => {});
  }

  return msg;
}

async function getGroupChatById(id: string) {
  return prisma.groupChat.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      createdById: true,
      members: { select: MEMBER_SELECT },
    },
  });
}
