import type { Request, Response } from "express";
import * as salaryService from "./salary.service";

export async function getSalaryChanges(req: Request, res: Response) {
  res.json(await salaryService.listSalaryChanges(req.params.employeeId));
}

export async function postSalaryChange(req: Request, res: Response) {
  const { amount, effectiveDate, reason } = req.body ?? {};
  if (amount === undefined || !effectiveDate) {
    res.status(400).json({ error: "Valor e data de vigência são obrigatórios" });
    return;
  }
  const salaryChange = await salaryService.createSalaryChange({
    employeeId: req.params.employeeId,
    amount: Number(amount),
    effectiveDate,
    reason,
    createdById: req.user!.sub,
  });
  res.status(201).json(salaryChange);
}

export async function deleteSalaryChange(req: Request, res: Response) {
  await salaryService.deleteSalaryChange(req.params.id);
  res.status(204).send();
}
