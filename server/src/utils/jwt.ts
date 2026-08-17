import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { Role } from "../generated/prisma/client";

export interface JwtPayload {
  sub: string;
  role: Role;
}

const EIGHT_HOURS_SECONDS = 8 * 60 * 60;

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: EIGHT_HOURS_SECONDS });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}

export const COOKIE_MAX_AGE_MS = EIGHT_HOURS_SECONDS * 1000;
