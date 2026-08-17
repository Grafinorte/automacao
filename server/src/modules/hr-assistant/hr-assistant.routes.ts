import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as ctrl from "./hr-assistant.controller";

export const hrAssistantRouter = Router();

hrAssistantRouter.use(requireAuth);
hrAssistantRouter.use(requireRole("ADMIN", "RH"));

hrAssistantRouter.post("/ask", asyncHandler(ctrl.postAsk));
hrAssistantRouter.get("/conversations", asyncHandler(ctrl.getConversations));
hrAssistantRouter.get("/conversations/:id", asyncHandler(ctrl.getConversation));
hrAssistantRouter.put("/conversations/:id", asyncHandler(ctrl.putConversation));
hrAssistantRouter.delete("/conversations/:id", asyncHandler(ctrl.deleteConversation));
