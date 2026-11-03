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

// IA lê as fotos do painel e devolve os números para o operador conferir (não grava nada)
colorProofRouter.post("/ler-fotos", asyncHandler(ctrl.postReadPhotos));

colorProofRouter.get("/", asyncHandler(ctrl.getProofs));
colorProofRouter.post("/", asyncHandler(ctrl.postProof));
colorProofRouter.put("/:id", asyncHandler(ctrl.putProof));
colorProofRouter.delete("/:id", asyncHandler(ctrl.deleteProof));
