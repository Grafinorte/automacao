import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as ctrl from "./group-chat.controller";

export const groupChatRouter = Router();

groupChatRouter.use(requireAuth);

groupChatRouter.get("/", asyncHandler(ctrl.getGroups));
groupChatRouter.post("/", requireRole("ADMIN"), asyncHandler(ctrl.postGroup));
groupChatRouter.get("/:id", asyncHandler(ctrl.getGroup));
groupChatRouter.delete("/:id", requireRole("ADMIN"), asyncHandler(ctrl.deleteGroup));
groupChatRouter.post("/:id/members", requireRole("ADMIN"), asyncHandler(ctrl.postMember));
groupChatRouter.delete("/:id/members/:userId", requireRole("ADMIN"), asyncHandler(ctrl.deleteMember));
groupChatRouter.get("/:id/messages", asyncHandler(ctrl.getMessages));
groupChatRouter.post("/:id/messages", asyncHandler(ctrl.postMessage));
