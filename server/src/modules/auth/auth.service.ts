import { prisma } from "../../db/prisma";
import { comparePassword, hashPassword } from "../../utils/password";
import { signToken } from "../../utils/jwt";
import { HttpError } from "../../middleware/errorHandler";

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    throw new HttpError(401, "Credenciais inválidas");
  }
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, "Credenciais inválidas");
  }
  const token = signToken({ sub: user.id, role: user.role });
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      avatarUrl: user.avatarUrl,
      waPhoneNumberId: user.waPhoneNumberId,
    },
  };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, "Usuário não encontrado");
  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(400, "Senha atual incorreta");
  if (newPassword.length < 8) throw new HttpError(400, "A nova senha deve ter pelo menos 8 caracteres");
  const newHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
}

export async function getSessionUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new HttpError(401, "Sessão inválida");
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    avatarUrl: user.avatarUrl,
    waPhoneNumberId: user.waPhoneNumberId,
  };
}
