import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as ctrl from "./notifications.controller";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/stream", ctrl.streamNotifications);
notificationsRouter.get("/", asyncHandler(ctrl.getNotifications));
notificationsRouter.get("/unread-count", asyncHandler(ctrl.getUnreadCount));
notificationsRouter.patch("/:id/read", asyncHandler(ctrl.patchRead));
notificationsRouter.post("/mark-all-read", asyncHandler(ctrl.postMarkAllRead));
notificationsRouter.get("/online", ctrl.getOnlineUsers);
