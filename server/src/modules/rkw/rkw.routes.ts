import { Router } from "express";
import * as rkwController from "./rkw.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const rkwRouter = Router();

rkwRouter.use(requireAuth, requireRole("ADMIN"));

rkwRouter.get("/",                         asyncHandler(rkwController.getRkwData));
rkwRouter.patch("/parameters/:key",        asyncHandler(rkwController.patchParameter));
rkwRouter.patch("/machine-rates/:id",      asyncHandler(rkwController.patchMachineRate));
rkwRouter.patch("/fixed-costs/:id",        asyncHandler(rkwController.patchFixedCost));
