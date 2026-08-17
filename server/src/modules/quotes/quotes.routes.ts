import { Router } from "express";
import * as quotesController from "./quotes.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const quotesRouter = Router();

quotesRouter.use(requireAuth, requireRole("ADMIN", "ORCAMENTISTA", "COMERCIAL"));

quotesRouter.get("/", asyncHandler(quotesController.getQuotes));
quotesRouter.get("/:id", asyncHandler(quotesController.getQuoteById));
quotesRouter.get("/:id/pdf", asyncHandler(quotesController.getQuotePdf));

quotesRouter.post(
  "/",
  requireRole("ADMIN", "ORCAMENTISTA", "COMERCIAL"),
  asyncHandler(quotesController.postQuote)
);
quotesRouter.post("/:id/send-email", asyncHandler(quotesController.postSendEmail));
quotesRouter.delete(
  "/:id",
  requireRole("ADMIN", "ORCAMENTISTA"),
  asyncHandler(quotesController.deleteQuote)
);
