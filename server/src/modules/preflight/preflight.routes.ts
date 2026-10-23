import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as ctrl from "./preflight.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.originalname.toLowerCase().endsWith(".pdf") ||
      file.mimetype === "application/pdf"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos PDF são aceitos."));
    }
  },
});

export const preflightRouter = Router();

preflightRouter.use(requireAuth);

preflightRouter.post("/analyze", upload.single("file"), asyncHandler(ctrl.postAnalyze));
preflightRouter.get("/history", asyncHandler(ctrl.getHistory));
preflightRouter.delete("/history", asyncHandler(ctrl.clearHistory));
preflightRouter.delete("/history/:id", asyncHandler(ctrl.deleteHistoryEntry));
