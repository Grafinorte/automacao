import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as ctrl from "./services.controller";

export const servicesRouter = Router();

servicesRouter.use(requireAuth);

servicesRouter.get("/", asyncHandler(ctrl.getServices));
servicesRouter.get("/logs", asyncHandler(ctrl.getLogs));
servicesRouter.post("/", asyncHandler(ctrl.postService));
servicesRouter.put("/fila", asyncHandler(ctrl.putQueue));
servicesRouter.put("/:id", asyncHandler(ctrl.putService));
servicesRouter.put("/:id/status", asyncHandler(ctrl.putStatus));
servicesRouter.post("/:id/attachment", asyncHandler(ctrl.postAttachment));
servicesRouter.delete("/:id/attachment", asyncHandler(ctrl.deleteAttachment));
