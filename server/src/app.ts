import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { boardRouter } from "./modules/board/board.routes";
import { tasksRouter } from "./modules/tasks/tasks.routes";
import { productsRouter } from "./modules/products/products.routes";
import { quotesRouter } from "./modules/quotes/quotes.routes";
import { messagesRouter } from "./modules/messages/messages.routes";
import { crmRouter } from "./modules/crm/crm.routes";
import { assistantRouter } from "./modules/assistant/assistant.routes";
import { marketingRouter } from "./modules/marketing/marketing.routes";
import { hrRouter } from "./modules/hr/hr.routes";
import { proposalRouter } from "./modules/proposal/proposal.routes";
import { stockRouter } from "./modules/stock/stock.routes";
import { knowledgeRouter } from "./modules/knowledge/knowledge.routes";
import { downloadsRouter } from "./modules/downloads/downloads.routes";
import { rkwRouter } from "./modules/rkw/rkw.routes";
import { whatsappRouter } from "./modules/whatsapp/whatsapp.routes";
import { productionRouter } from "./modules/production/production.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { groupChatRouter } from "./modules/group-chat/group-chat.routes";
import { webhookRouter } from "./modules/webhook/webhook.routes";
import { servicesRouter } from "./modules/services/services.routes";
import { hrAssistantRouter } from "./modules/hr-assistant/hr-assistant.routes";
import { errorHandler } from "./middleware/errorHandler";
import { requireAuth, requireRole } from "./middleware/auth";

export const app = express();

// Security headers (removes X-Powered-By, adds XSS protection, etc.)
app.use(helmet({ contentSecurityPolicy: false }));

// Brute-force protection: max 10 login attempts per IP per 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Muitas tentativas de login. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: "200mb" }));
app.use(cookieParser());

app.use("/avatars", express.static(path.join(__dirname, "../data/avatars")));
app.use("/attachments", requireAuth, express.static(path.join(__dirname, "../data/attachments")));
app.use("/wa-media", requireAuth, express.static(path.join(__dirname, "../data/wa-media")));
app.use(
  "/hr-documents",
  requireAuth,
  requireRole("ADMIN", "RH"),
  express.static(path.join(__dirname, "../data/hr-documents"))
);

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/board", boardRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/products", productsRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/crm", crmRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/marketing", marketingRouter);
app.use("/api/hr", hrRouter);
app.use("/api/proposal", proposalRouter);
app.use("/api/stock", stockRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/downloads", downloadsRouter);
app.use("/api/rkw", rkwRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/production", productionRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/group-chats", groupChatRouter);
app.use("/api/webhook", webhookRouter);
app.use("/api/servicos", servicesRouter);
app.use("/api/hr-assistant", hrAssistantRouter);

const clientDistPath = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDistPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith("index.html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  },
}));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(clientDistPath, "index.html"));
});

app.use(errorHandler);
