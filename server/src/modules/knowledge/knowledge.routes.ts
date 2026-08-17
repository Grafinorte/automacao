import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import * as knowledgeController from "./knowledge.controller";

export const knowledgeRouter = Router();

knowledgeRouter.use(requireAuth);

knowledgeRouter.get("/documents", asyncHandler(knowledgeController.getDocuments));
knowledgeRouter.post("/ask", asyncHandler(knowledgeController.postAsk));

knowledgeRouter.get("/conversations", asyncHandler(knowledgeController.getConversations));
knowledgeRouter.get("/conversations/:id", asyncHandler(knowledgeController.getConversation));
knowledgeRouter.put("/conversations/:id", asyncHandler(knowledgeController.putConversation));
knowledgeRouter.delete("/conversations/:id", asyncHandler(knowledgeController.deleteConversation));
