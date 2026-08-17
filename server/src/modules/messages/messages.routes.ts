import { Router } from "express";
import multer from "multer";
import * as messagesController from "./messages.controller";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const messagesRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

messagesRouter.use(requireAuth);

messagesRouter.get("/conversations", asyncHandler(messagesController.getConversations));
messagesRouter.get("/unread-count", asyncHandler(messagesController.getUnreadCount));
messagesRouter.get("/with/:userId", asyncHandler(messagesController.getThread));
messagesRouter.patch("/with/:userId/read", asyncHandler(messagesController.patchThreadRead));
messagesRouter.post("/", asyncHandler(messagesController.postMessage));
messagesRouter.post("/upload", upload.single("file"), asyncHandler(messagesController.postUploadMessageFile));
