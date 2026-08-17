import { Router } from "express";
import * as usersController from "./users.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const usersRouter = Router();

usersRouter.get("/directory", requireAuth, asyncHandler(usersController.getDirectory));
usersRouter.patch("/me/avatar", requireAuth, asyncHandler(usersController.patchMyAvatar));
usersRouter.patch("/me/area", requireAuth, asyncHandler(usersController.patchMyArea));
usersRouter.get("/me/email-settings", requireAuth, asyncHandler(usersController.getMyEmailSettings));
usersRouter.patch("/me/email-settings", requireAuth, asyncHandler(usersController.patchMyEmailSettings));

usersRouter.use(requireAuth, requireRole("ADMIN"));

usersRouter.get("/", asyncHandler(usersController.getUsers));
usersRouter.post("/", asyncHandler(usersController.postUser));
usersRouter.get("/:id", asyncHandler(usersController.getUserById));
usersRouter.patch("/:id", asyncHandler(usersController.patchUser));
usersRouter.patch("/:id/activate", asyncHandler(usersController.activateUser));
usersRouter.patch("/:id/deactivate", asyncHandler(usersController.deactivateUser));
