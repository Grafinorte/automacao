import { Router } from "express";
import * as ctrl from "./colorProof.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const colorProofRouter = Router();

colorProofRouter.use(requireAuth);

// /settings antes de /:id, senão o PUT dos preços cairia na edição de prova
colorProofRouter.get("/settings", asyncHandler(ctrl.getSettings));
// Preços só o admin muda
colorProofRouter.put("/settings", requireRole("ADMIN"), asyncHandler(ctrl.putSettings));

colorProofRouter.get("/", asyncHandler(ctrl.getProofs));
colorProofRouter.post("/", asyncHandler(ctrl.postProof));
colorProofRouter.put("/:id", asyncHandler(ctrl.putProof));
colorProofRouter.delete("/:id", asyncHandler(ctrl.deleteProof));
