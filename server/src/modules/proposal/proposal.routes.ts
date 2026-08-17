import { Router } from "express";
import * as proposalController from "./proposal.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const proposalRouter = Router();

proposalRouter.use(requireAuth, requireRole("ADMIN", "ORCAMENTISTA", "COMERCIAL"));
proposalRouter.post("/extract", asyncHandler(proposalController.postExtract));
