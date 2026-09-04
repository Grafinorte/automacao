import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as ctrl from "./whatsapp.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

export const whatsappRouter = Router();

// Webhook público — Meta não envia autenticação
whatsappRouter.get("/webhook", ctrl.verifyWebhook);
whatsappRouter.post("/webhook", asyncHandler(ctrl.receiveWebhook));

// Tudo abaixo requer login
whatsappRouter.use(requireAuth);

// Stats
whatsappRouter.get("/stats", asyncHandler(ctrl.getStats));

// Conversations
whatsappRouter.post("/conversations/start", asyncHandler(ctrl.startConversation));
whatsappRouter.get("/conversations", asyncHandler(ctrl.getConversations));
whatsappRouter.get("/conversations/:id/messages", asyncHandler(ctrl.getConversationMessages));
whatsappRouter.post("/conversations/:id/messages", asyncHandler(ctrl.postMessage));
whatsappRouter.post("/conversations/:id/media", asyncHandler(ctrl.postMediaMessage));
whatsappRouter.patch("/conversations/:id", asyncHandler(ctrl.patchConversation));
whatsappRouter.patch("/messages/:messageId", asyncHandler(ctrl.patchMessage));
whatsappRouter.patch("/messages/:messageId/star", asyncHandler(ctrl.starMessage));
whatsappRouter.delete("/messages/:messageId", asyncHandler(ctrl.deleteMessage));
whatsappRouter.get("/link-preview", asyncHandler(ctrl.getLinkPreview));

// Media upload
whatsappRouter.post("/media/upload", upload.single("file"), asyncHandler(ctrl.uploadMedia));

// Contacts
whatsappRouter.get("/contacts", asyncHandler(ctrl.getContacts));
whatsappRouter.patch("/contacts/:id", asyncHandler(ctrl.patchContact));

// Labels
whatsappRouter.get("/labels", asyncHandler(ctrl.getLabels));
whatsappRouter.post("/labels", requireRole("ADMIN"), asyncHandler(ctrl.postLabel));
whatsappRouter.delete("/labels/:id", requireRole("ADMIN"), asyncHandler(ctrl.deleteLabel));
whatsappRouter.post("/conversations/:id/labels/:labelId", asyncHandler(ctrl.postConversationLabel));
whatsappRouter.delete("/conversations/:id/labels/:labelId", asyncHandler(ctrl.deleteConversationLabel));

// Agents (for assignment)
whatsappRouter.get("/agents", asyncHandler(ctrl.getAgents));

// Meta Message Templates (aprovação Meta)
whatsappRouter.get("/meta-templates", asyncHandler(ctrl.getMetaTemplates));
whatsappRouter.post("/meta-templates", requireRole("ADMIN"), asyncHandler(ctrl.postMetaTemplate));
whatsappRouter.post("/meta-templates/send", asyncHandler(ctrl.postTemplateMessage));

// Templates (respostas rápidas internas)
whatsappRouter.get("/templates", asyncHandler(ctrl.getTemplates));
whatsappRouter.post("/templates", requireRole("ADMIN"), asyncHandler(ctrl.postTemplate));
whatsappRouter.patch("/templates/:id", requireRole("ADMIN"), asyncHandler(ctrl.patchTemplate));
whatsappRouter.delete("/templates/:id", requireRole("ADMIN"), asyncHandler(ctrl.deleteTemplate));

// Automations (ADMIN only)
whatsappRouter.get("/automations", asyncHandler(ctrl.getAutomations));
whatsappRouter.post("/automations", requireRole("ADMIN"), asyncHandler(ctrl.postAutomation));
whatsappRouter.patch("/automations/:id", requireRole("ADMIN"), asyncHandler(ctrl.patchAutomation));
whatsappRouter.delete("/automations/:id", requireRole("ADMIN"), asyncHandler(ctrl.deleteAutomation));

// Phone numbers (multi-number coexistence)
whatsappRouter.get("/phone-numbers", asyncHandler(ctrl.getPhoneNumbers));
whatsappRouter.post("/phone-numbers", requireRole("ADMIN"), asyncHandler(ctrl.postPhoneNumber));
whatsappRouter.patch("/phone-numbers/:id", requireRole("ADMIN"), asyncHandler(ctrl.patchPhoneNumber));
whatsappRouter.delete("/phone-numbers/:id", requireRole("ADMIN"), asyncHandler(ctrl.deletePhoneNumber));

// Legacy
whatsappRouter.post("/send", requireRole("ADMIN"), asyncHandler(ctrl.sendMessage));
