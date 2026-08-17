import { prisma } from "../../db/prisma";
import { hashPassword } from "../../utils/password";
import { HttpError } from "../../middleware/errorHandler";
import type { Role } from "../../generated/prisma/client";

const PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  permissions: true,
  isActive: true,
  avatarUrl: true,
  createdAt: true,
  waPhoneNumberId: true,
} as const;

export function listUsers() {
  return prisma.user.findMany({
    select: PUBLIC_SELECT,
    orderBy: { name: "asc" },
  });
}

export function listActiveDirectory() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, avatarUrl: true, role: true },
    orderBy: { name: "asc" },
  });
}

export function setAvatarUrl(id: string, avatarUrl: string | null) {
  return prisma.user.update({ where: { id }, data: { avatarUrl }, select: PUBLIC_SELECT });
}

export function getUser(id: string) {
  return prisma.user.findUniqueOrThrow({ where: { id }, select: PUBLIC_SELECT });
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role?: Role;
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new HttpError(409, "Já existe um usuário com este email");
  }
  const passwordHash = await hashPassword(data.password);
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role ?? "MEMBER",
    },
    select: PUBLIC_SELECT,
  });
}

export async function updateUser(
  id: string,
  data: { name?: string; email?: string; role?: Role; password?: string; permissions?: string[] | null; waPhoneNumberId?: string | null }
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.password) updateData.passwordHash = await hashPassword(data.password);
  if ("permissions" in data) {
    updateData.permissions = data.permissions == null ? null : JSON.stringify(data.permissions);
  }
  if ("waPhoneNumberId" in data) {
    updateData.waPhoneNumberId = data.waPhoneNumberId || null;
  }

  return prisma.user.update({
    where: { id },
    data: updateData,
    select: PUBLIC_SELECT,
  });
}

export function setUserActive(id: string, isActive: boolean) {
  return prisma.user.update({
    where: { id },
    data: { isActive },
    select: PUBLIC_SELECT,
  });
}

export function updateEmailSettings(id: string, smtpEmail: string, smtpAppPassword: string) {
  return prisma.user.update({
    where: { id },
    data: { smtpEmail, smtpAppPassword },
    select: PUBLIC_SELECT,
  });
}

export function getEmailSettings(id: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id },
    select: { smtpEmail: true },
  });
}
