import type { Request, Response } from "express";
import * as stagesService from "./stages.service";

export async function getStages(_req: Request, res: Response) {
  res.json(await stagesService.listStages());
}

export async function postStage(req: Request, res: Response) {
  const { name } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: "Nome do estágio é obrigatório" });
    return;
  }
  res.status(201).json(await stagesService.createStage(name));
}

export async function patchStage(req: Request, res: Response) {
  const { name } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: "Nome do estágio é obrigatório" });
    return;
  }
  res.json(await stagesService.renameStage(req.params.id, name));
}

export async function patchStagesReorder(req: Request, res: Response) {
  const { orderedStageIds } = req.body ?? {};
  if (!Array.isArray(orderedStageIds)) {
    res.status(400).json({ error: "orderedStageIds deve ser uma lista" });
    return;
  }
  await stagesService.reorderStages(orderedStageIds);
  res.status(204).send();
}

export async function deleteStage(req: Request, res: Response) {
  await stagesService.deleteStage(req.params.id);
  res.status(204).send();
}

export async function postSetupDefaultStages(_req: Request, res: Response) {
  const result = await stagesService.setupDefaultStages();
  res.json(result);
}
