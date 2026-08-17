import { Router } from "express";
import * as authController from "./auth.controller";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(authController.postLogin));
authRouter.post("/logout", authController.postLogout);
authRouter.get("/me", requireAuth, asyncHandler(authController.getMe));
authRouter.patch("/password", requireAuth, asyncHandler(authController.patchMyPassword));
