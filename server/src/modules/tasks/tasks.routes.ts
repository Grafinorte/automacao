import { Router } from "express";
import * as tasksController from "./tasks.controller";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

tasksRouter.get("/", asyncHandler(tasksController.getTasks));
tasksRouter.post("/", asyncHandler(tasksController.postTask));
tasksRouter.get("/:id", asyncHandler(tasksController.getTaskById));
tasksRouter.patch("/:id", asyncHandler(tasksController.patchTask));
tasksRouter.delete("/:id", asyncHandler(tasksController.deleteTask));
tasksRouter.patch("/:id/move", asyncHandler(tasksController.moveTask));
tasksRouter.post("/:id/attachments", asyncHandler(tasksController.postTaskAttachment));
tasksRouter.delete("/:id/attachments/:attachmentId", asyncHandler(tasksController.deleteTaskAttachment));
tasksRouter.post("/:id/subtasks", asyncHandler(tasksController.postSubtask));
tasksRouter.patch("/:id/subtasks/:subtaskId", asyncHandler(tasksController.patchSubtask));
tasksRouter.delete("/:id/subtasks/:subtaskId", asyncHandler(tasksController.deleteSubtask));
tasksRouter.post("/:id/members", asyncHandler(tasksController.postTaskMember));
tasksRouter.delete("/:id/members/:userId", asyncHandler(tasksController.deleteTaskMember));
