import { Router } from "express";
import * as assistantController from "./assistant.controller";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const assistantRouter = Router();

assistantRouter.use(requireAuth);

assistantRouter.post("/chat", asyncHandler(assistantController.postChat));
