import { Router } from "express";
import cors from "cors";
import { asyncHandler } from "../../utils/asyncHandler";
import * as ctrl from "./webhook.controller";

export const webhookRouter = Router();

// Allow any origin so the external site can POST from the browser
webhookRouter.use(cors({ origin: "*", methods: ["POST", "OPTIONS"] }));

webhookRouter.post("/lead", asyncHandler(ctrl.postLead));
