import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as ctrl from "./production.controller";

export const productionRouter = Router();

productionRouter.use(requireAuth);

productionRouter.get("/", asyncHandler(ctrl.getOrders));
productionRouter.post("/", asyncHandler(ctrl.postOrder));
productionRouter.patch("/:id", asyncHandler(ctrl.patchOrder));
productionRouter.post("/:id/advance", asyncHandler(ctrl.postAdvance));
productionRouter.post("/:id/cancel", asyncHandler(ctrl.postCancel));
productionRouter.delete("/:id", asyncHandler(ctrl.deleteOrder));
