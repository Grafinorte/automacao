import type { Request, Response } from "express";
import * as vacationsService from "./vacations.service";

export async function getVacations(_req: Request, res: Response) {
  res.json(await vacationsService.listVacations());
}

export async function getVacationsForEmployee(req: Request, res: Response) {
  res.json(await vacationsService.listVacationsForEmployee(req.params.employeeId));
}

export async function postVacation(req: Request, res: Response) {
  const { startDate, endDate, status, notes } = req.body ?? {};
  if (!startDate || !endDate) {
    res.status(400).json({ error: "Data de início e fim são obrigatórias" });
    return;
  }
  const vacation = await vacationsService.createVacation({
    employeeId: req.params.employeeId,
    startDate,
    endDate,
    status,
    notes,
  });
  res.status(201).json(vacation);
}

export async function patchVacation(req: Request, res: Response) {
  const { startDate, endDate, status, notes } = req.body ?? {};
  const vacation = await vacationsService.updateVacation(req.params.id, {
    startDate,
    endDate,
    status,
    notes,
  });
  res.json(vacation);
}

export async function deleteVacation(req: Request, res: Response) {
  await vacationsService.deleteVacation(req.params.id);
  res.status(204).send();
}
