import { Router } from "express";
import * as campaignsController from "./campaigns.controller";
import * as contentController from "./content.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const marketingRouter = Router();

marketingRouter.use(requireAuth, requireRole("ADMIN", "MARKETING"));

// Campaigns
marketingRouter.get("/campaigns", asyncHandler(campaignsController.getCampaigns));
marketingRouter.post("/campaigns", asyncHandler(campaignsController.postCampaign));
marketingRouter.get("/campaigns/:id", asyncHandler(campaignsController.getCampaignById));
marketingRouter.patch("/campaigns/:id", asyncHandler(campaignsController.patchCampaign));
marketingRouter.delete("/campaigns/:id", asyncHandler(campaignsController.deleteCampaign));

// Content board
marketingRouter.get("/content/board", asyncHandler(contentController.getBoard));
marketingRouter.post("/content", asyncHandler(contentController.postContentItem));
marketingRouter.get("/content/:id", asyncHandler(contentController.getContentItemById));
marketingRouter.patch("/content/:id", asyncHandler(contentController.patchContentItem));
marketingRouter.delete("/content/:id", asyncHandler(contentController.deleteContentItem));
marketingRouter.patch("/content/:id/move", asyncHandler(contentController.moveContentItem));
