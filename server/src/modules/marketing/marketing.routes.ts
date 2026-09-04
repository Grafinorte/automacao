import { Router } from "express";
import multer from "multer";
import * as campaignsController from "./campaigns.controller";
import * as contentController from "./content.controller";
import * as metaController from "../meta/meta.controller";
import * as competitorController from "./competitor.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

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

// Meta / Instagram
marketingRouter.get("/meta/accounts", asyncHandler(metaController.getAccounts));
marketingRouter.get("/meta/summary", asyncHandler(metaController.getSummary));
marketingRouter.get("/meta/:account/profile", asyncHandler(metaController.getProfile));
marketingRouter.get("/meta/:account/posts", asyncHandler(metaController.getPosts));
marketingRouter.get("/meta/:account/insights", asyncHandler(metaController.getInsights));
marketingRouter.get("/meta/:account/posts/:mediaId/insights", asyncHandler(metaController.getPostInsights));
marketingRouter.post("/meta/:account/publish", asyncHandler(metaController.publishNow));
marketingRouter.post("/meta/upload", upload.single("file"), asyncHandler(metaController.uploadMedia));
marketingRouter.get("/meta/schedule", asyncHandler(metaController.getScheduledPosts));
marketingRouter.post("/meta/schedule", asyncHandler(metaController.schedulePost));
marketingRouter.delete("/meta/schedule/:id", asyncHandler(metaController.deleteScheduledPost));

// Competitor analysis
marketingRouter.get("/competitor", asyncHandler(competitorController.getProfiles));
marketingRouter.post("/competitor", asyncHandler(competitorController.postProfile));
marketingRouter.delete("/competitor/:id", asyncHandler(competitorController.deleteProfile));
marketingRouter.get("/competitor/:id/report", asyncHandler(competitorController.getReport));
marketingRouter.get("/competitor/:id/history", asyncHandler(competitorController.getHistory));
marketingRouter.post("/competitor/:id/analyze", asyncHandler(competitorController.triggerAnalysis));
