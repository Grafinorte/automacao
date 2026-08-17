import { Router } from "express";
import * as productsController from "./products.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const productsRouter = Router();

productsRouter.use(requireAuth, requireRole("ADMIN", "ORCAMENTISTA"));

productsRouter.get("/", asyncHandler(productsController.getProducts));
productsRouter.post("/", requireRole("ADMIN"), asyncHandler(productsController.postProduct));
productsRouter.patch("/:id", requireRole("ADMIN"), asyncHandler(productsController.patchProduct));
productsRouter.delete("/:id", requireRole("ADMIN"), asyncHandler(productsController.deleteProduct));
