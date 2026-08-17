import type { Request, Response } from "express";
import * as usersService from "./users.service";
import { saveAvatarFromDataUrl } from "../../utils/avatarStorage";
import { signToken, COOKIE_MAX_AGE_MS } from "../../utils/jwt";
import type { Role } from "../../generated/prisma/client";

export async function getUsers(_req: Request, res: Response) {
  res.json(await usersService.listUsers());
}

export async function getDirectory(_req: Request, res: Response) {
  res.json(await usersService.listActiveDirectory());
}

export async function getUserById(req: Request, res: Response) {
  res.json(await usersService.getUser(req.params.id));
}

export async function postUser(req: Request, res: Response) {
  const { name, email, password, role } = req.body ?? {};
  if (!name || !email || !password) {
    res.status(400).json({ error: "Nome, email e senha são obrigatórios" });
    return;
  }
  const user = await usersService.createUser({ name, email, password, role });
  res.status(201).json(user);
}

export async function patchUser(req: Request, res: Response) {
  const { name, email, role, password, permissions, waPhoneNumberId } = req.body ?? {};
  const user = await usersService.updateUser(req.params.id, {
    name,
    email,
    role,
    password,
    ...(permissions !== undefined ? { permissions: Array.isArray(permissions) ? permissions : null } : {}),
    ...("waPhoneNumberId" in (req.body ?? {}) ? { waPhoneNumberId: waPhoneNumberId ?? null } : {}),
  });
  res.json(user);
}

export async function activateUser(req: Request, res: Response) {
  res.json(await usersService.setUserActive(req.params.id, true));
}

export async function deactivateUser(req: Request, res: Response) {
  res.json(await usersService.setUserActive(req.params.id, false));
}

export async function patchMyArea(req: Request, res: Response) {
  res.status(403).json({ error: "Apenas administradores podem alterar permissões de usuários." });
}

export async function getMyEmailSettings(req: Request, res: Response) {
  res.json(await usersService.getEmailSettings(req.user!.sub));
}

export async function patchMyEmailSettings(req: Request, res: Response) {
  const { smtpEmail, smtpAppPassword } = req.body ?? {};
  if (!smtpEmail || !smtpAppPassword) {
    res.status(400).json({ error: "E-mail e senha de app são obrigatórios." });
    return;
  }
  await usersService.updateEmailSettings(req.user!.sub, smtpEmail, smtpAppPassword);
  res.json({ ok: true });
}

export async function patchMyAvatar(req: Request, res: Response) {
  const { imageBase64 } = req.body ?? {};
  if (!imageBase64) {
    res.status(400).json({ error: "Imagem é obrigatória" });
    return;
  }
  const avatarUrl = saveAvatarFromDataUrl(req.user!.sub, imageBase64);
  res.json(await usersService.setAvatarUrl(req.user!.sub, avatarUrl));
}
