import type { Request, Response } from "express";
import * as stockService from "./stock.service";

export async function getItems(_req: Request, res: Response) {
  const items = await stockService.listItems();
  res.json(items);
}

export async function postItem(req: Request, res: Response) {
  const { name, category, unit, quantity, minQuantity, location, notes } = req.body ?? {};
  if (!name?.trim()) { res.status(400).json({ error: "Nome é obrigatório" }); return; }
  if (!category?.trim()) { res.status(400).json({ error: "Categoria é obrigatória" }); return; }
  if (!unit?.trim()) { res.status(400).json({ error: "Unidade é obrigatória" }); return; }
  const item = await stockService.createItem({
    name: name.trim(),
    category: category.trim(),
    unit: unit.trim(),
    quantity: Number(quantity) || 0,
    minQuantity: Number(minQuantity) || 0,
    location: location?.trim() || undefined,
    notes: notes?.trim() || undefined,
  });
  res.status(201).json(item);
}

export async function patchItem(req: Request, res: Response) {
  const { id } = req.params;
  const { name, category, unit, minQuantity, location, notes } = req.body ?? {};
  const item = await stockService.updateItem(id, {
    name: name?.trim(),
    category: category?.trim(),
    unit: unit?.trim(),
    minQuantity: minQuantity !== undefined ? Number(minQuantity) : undefined,
    location: location?.trim() || undefined,
    notes: notes?.trim() || undefined,
  });
  res.json(item);
}

export async function deleteItem(req: Request, res: Response) {
  const { id } = req.params;
  await stockService.deactivateItem(id);
  res.status(204).end();
}

export async function postMovement(req: Request, res: Response) {
  const { id } = req.params;
  const { type, quantity, notes } = req.body ?? {};
  const userId = req.user!.sub;
  if (!["ENTRADA", "SAIDA", "AJUSTE"].includes(type)) {
    res.status(400).json({ error: "Tipo inválido" }); return;
  }
  if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
    res.status(400).json({ error: "Quantidade inválida" }); return;
  }
  const result = await stockService.addMovement(id, userId, type, Number(quantity), notes?.trim());
  res.status(201).json(result);
}

export async function getMovements(req: Request, res: Response) {
  const { id } = req.params;
  const movements = await stockService.getMovements(id);
  res.json(movements);
}

export async function getRecentMovements(_req: Request, res: Response) {
  const movements = await stockService.getRecentMovements();
  res.json(movements);
}
