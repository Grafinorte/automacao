import jwt from "jsonwebtoken";
import type { Response } from "express";
import { env } from "../config/env";
import type { Role } from "../generated/prisma/client";

export interface JwtPayload {
  sub: string;
  role: Role;
  iat?: number;
  exp?: number;
}

/** A sessão expira após 12h SEM uso — cada requisição autenticada renova o prazo. */
const SESSION_IDLE_SECONDS = 12 * 60 * 60;
/** Evita reemitir o cookie em toda requisição: só renova tokens com mais de 10 min. */
const RENEW_AFTER_SECONDS = 10 * 60;

export function signToken(payload: JwtPayload): string {
  return jwt.sign({ sub: payload.sub, role: payload.role }, env.jwtSecret, {
    expiresIn: SESSION_IDLE_SECONDS,
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}

export const COOKIE_MAX_AGE_MS = SESSION_IDLE_SECONDS * 1000;

export function setAuthCookie(res: Response, token: string) {
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

export function shouldRenew(payload: JwtPayload): boolean {
  if (!payload.iat) return true;
  return Date.now() / 1000 - payload.iat > RENEW_AFTER_SECONDS;
}
