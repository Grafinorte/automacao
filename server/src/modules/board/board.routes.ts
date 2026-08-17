import { Router } from "express";
import * as boardController from "./board.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const boardRouter = Router();

boardRouter.use(requireAuth);

// Board list + specific board
boardRouter.get("/list", asyncHandler(boardController.getBoards));
boardRouter.get("/:boardId", asyncHandler(boardController.getBoardById));

// Board management (admin only)
boardRouter.post("/", requireRole("ADMIN"), asyncHandler(boardController.postBoard));
boardRouter.delete("/:boardId/delete", requireRole("ADMIN"), asyncHandler(boardController.deleteBoard));

// Board members (admin only)
boardRouter.get("/:boardId/members", asyncHandler(boardController.getBoardMembers));
boardRouter.post("/:boardId/members", requireRole("ADMIN"), asyncHandler(boardController.postBoardMember));
boardRouter.delete("/:boardId/members/:userId", requireRole("ADMIN"), asyncHandler(boardController.deleteBoardMember));

// Column operations (admin only)
boardRouter.post("/columns/add", requireRole("ADMIN"), asyncHandler(boardController.postColumn));
boardRouter.patch("/columns/reorder", requireRole("ADMIN"), asyncHandler(boardController.patchColumnsReorder));
boardRouter.patch("/columns/:id", requireRole("ADMIN"), asyncHandler(boardController.patchColumn));
boardRouter.delete("/columns/:id", requireRole("ADMIN"), asyncHandler(boardController.deleteColumn));
