import { Router } from "express";
import * as ctrl from "./pcpStock.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const pcpStockRouter = Router();

pcpStockRouter.use(requireAuth, asyncHandler(ctrl.requireStockAccess));

pcpStockRouter.post("/ler-os", asyncHandler(ctrl.postReadOs));
pcpStockRouter.get("/items", asyncHandler(ctrl.getItems));
pcpStockRouter.post("/items", asyncHandler(ctrl.postItem));
pcpStockRouter.patch("/items/:id", asyncHandler(ctrl.patchItem));
pcpStockRouter.delete("/items/:id", asyncHandler(ctrl.deleteItem));
pcpStockRouter.post("/items/:id/movements", asyncHandler(ctrl.postMovement));
pcpStockRouter.get("/movements", asyncHandler(ctrl.getMovements));

// Fluxo: produção concluída, conferência da expedição e despacho
pcpStockRouter.post("/items/:id/stage", asyncHandler(ctrl.postStage));
pcpStockRouter.post("/items/:id/receive", asyncHandler(ctrl.postReceive));
pcpStockRouter.get("/dispatch", asyncHandler(ctrl.getDispatch));
pcpStockRouter.post("/movements/:id/dispatch", asyncHandler(ctrl.postDispatch));

pcpStockRouter.get("/settings", asyncHandler(ctrl.getSettings));
// Quem recebe, quem envia e o envio manual ficam com o admin
pcpStockRouter.put("/settings", requireRole("ADMIN"), asyncHandler(ctrl.putSettings));
pcpStockRouter.post("/report/send", requireRole("ADMIN"), asyncHandler(ctrl.postSendReport));
