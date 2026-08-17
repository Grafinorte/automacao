import { Router } from "express";
import * as stockController from "./stock.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const stockRouter = Router();

stockRouter.use(requireAuth, requireRole("ADMIN", "ALMOXARIFADO"));

stockRouter.get("/items", asyncHandler(stockController.getItems));
stockRouter.get("/movements/recent", asyncHandler(stockController.getRecentMovements));
stockRouter.get("/items/:id/movements", asyncHandler(stockController.getMovements));
stockRouter.post("/items/:id/movements", asyncHandler(stockController.postMovement));

// Admin-only
stockRouter.post("/items", requireRole("ADMIN"), asyncHandler(stockController.postItem));
stockRouter.patch("/items/:id", requireRole("ADMIN"), asyncHandler(stockController.patchItem));
stockRouter.delete("/items/:id", requireRole("ADMIN"), asyncHandler(stockController.deleteItem));
