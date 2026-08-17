import type { Request, Response } from "express";
import * as employeesService from "./employees.service";

export async function getEmployees(req: Request, res: Response) {
  const company = typeof req.query.company === "string" ? req.query.company : undefined;
  res.json(await employeesService.listEmployees(company));
}

export async function getEmployeeById(req: Request, res: Response) {
  res.json(await employeesService.getEmployee(req.params.id));
}

export async function postEmployee(req: Request, res: Response) {
  const {
    name,
    cpf,
    rg,
    birthDate,
    email,
    phone,
    address,
    position,
    department,
    company,
    admissionDate,
    status,
    salary,
    notes,
  } = req.body ?? {};
  if (!name || !position || !department || !admissionDate || salary === undefined) {
    res
      .status(400)
      .json({ error: "Nome, cargo, setor, data de admissão e salário são obrigatórios" });
    return;
  }
  const employee = await employeesService.createEmployee({
    name,
    cpf,
    rg,
    birthDate,
    email,
    phone,
    address,
    position,
    department,
    company,
    admissionDate,
    status,
    salary: Number(salary),
    notes,
    createdById: req.user!.sub,
  });
  res.status(201).json(employee);
}

export async function patchEmployee(req: Request, res: Response) {
  const {
    name,
    cpf,
    rg,
    birthDate,
    email,
    phone,
    address,
    position,
    department,
    company,
    admissionDate,
    terminationDate,
    status,
    salary,
    notes,
  } = req.body ?? {};
  const employee = await employeesService.updateEmployee(req.params.id, {
    name,
    cpf,
    rg,
    birthDate,
    email,
    phone,
    address,
    position,
    department,
    company,
    admissionDate,
    terminationDate,
    status,
    salary: salary !== undefined ? Number(salary) : undefined,
    notes,
  });
  res.json(employee);
}

export async function deleteEmployee(req: Request, res: Response) {
  await employeesService.deleteEmployee(req.params.id);
  res.status(204).send();
}
