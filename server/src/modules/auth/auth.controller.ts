import type { Request, Response } from "express";
import * as authService from "./auth.service";
import { COOKIE_MAX_AGE_MS } from "../../utils/jwt";

export async function postLogin(req: Request, res: Response) {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "Email e senha são obrigatórios" });
    return;
  }
  const { token, user } = await authService.login(email, password);
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
  res.json(user);
}

export function postLogout(_req: Request, res: Response) {
  res.clearCookie("token", { path: "/" });
  res.status(204).send();
}

export async function getMe(req: Request, res: Response) {
  const user = await authService.getSessionUser(req.user!.sub);
  res.json(user);
}

export async function patchMyPassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Senha atual e nova senha são obrigatórias" });
    return;
  }
  await authService.changePassword(req.user!.sub, currentPassword, newPassword);
  res.status(204).send();
}
