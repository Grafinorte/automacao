import { Router } from "express";
import * as stagesController from "./stages.controller";
import * as contactsController from "./contacts.controller";
import * as dealsController from "./deals.controller";
import * as activitiesController from "./activities.controller";
import * as prospectingController from "./prospecting.controller";
import * as crmAgentController from "./crm-agent.controller";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";

export const crmRouter = Router();

crmRouter.use(requireAuth, requireRole("ADMIN", "COMERCIAL"));

// Board / stages
crmRouter.get("/board", asyncHandler(dealsController.getBoard));
crmRouter.get("/stages", asyncHandler(stagesController.getStages));
crmRouter.post("/stages/setup-defaults", requireRole("ADMIN"), asyncHandler(stagesController.postSetupDefaultStages));
crmRouter.post("/stages", requireRole("ADMIN"), asyncHandler(stagesController.postStage));
crmRouter.patch(
  "/stages/reorder",
  requireRole("ADMIN"),
  asyncHandler(stagesController.patchStagesReorder)
);
crmRouter.patch("/stages/:id", requireRole("ADMIN"), asyncHandler(stagesController.patchStage));
crmRouter.delete("/stages/:id", requireRole("ADMIN"), asyncHandler(stagesController.deleteStage));

// Contacts
crmRouter.get("/contacts", asyncHandler(contactsController.getContacts));
crmRouter.post("/contacts", asyncHandler(contactsController.postContact));
crmRouter.post("/contacts/import", asyncHandler(contactsController.postImportContacts));
crmRouter.get("/contacts/:id", asyncHandler(contactsController.getContactById));
crmRouter.patch("/contacts/:id", asyncHandler(contactsController.patchContact));
crmRouter.delete("/contacts/:id", asyncHandler(contactsController.deleteContact));

// Deals
crmRouter.post("/deals", asyncHandler(dealsController.postDeal));
crmRouter.get("/deals/export", asyncHandler(dealsController.getDealsExport));
crmRouter.get("/deals/:id", asyncHandler(dealsController.getDealById));
crmRouter.patch("/deals/:id", asyncHandler(dealsController.patchDeal));
crmRouter.delete("/deals/:id", asyncHandler(dealsController.deleteDeal));
crmRouter.patch("/deals/:id/move", asyncHandler(dealsController.moveDeal));
crmRouter.post("/deals/:dealId/activities", asyncHandler(activitiesController.postActivity));

// Prospecção (IA)
crmRouter.post("/prospecting", asyncHandler(prospectingController.postProspecting));
crmRouter.post("/prospecting/stream", prospectingController.postProspectingStream);

// Agente IA
crmRouter.post("/agent", asyncHandler(crmAgentController.postCrmAgent));
