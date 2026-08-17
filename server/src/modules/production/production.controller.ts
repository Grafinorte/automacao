import type { Request, Response } from "express";
import * as svc from "./production.service";

export async function getOrders(req: Request, res: Response) {
  const orders = await svc.listOrders();
  res.json(orders);
}

export async function postOrder(req: Request, res: Response) {
  const { title, clientName, priority, dueDate, notes } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Título obrigatório" });
  if (!clientName?.trim()) return res.status(400).json({ error: "Cliente obrigatório" });

  const order = await svc.createOrder({
    title: title.trim(),
    clientName: clientName.trim(),
    priority,
    dueDate,
    notes,
    createdById: req.user!.sub as string,
  });
  res.status(201).json(order);
}

export async function patchOrder(req: Request, res: Response) {
  const order = await svc.updateOrder(req.params.id, req.body);
  res.json(order);
}

export async function postAdvance(req: Request, res: Response) {
  const order = await svc.advanceOrder(req.params.id, req.user!.sub as string);
  res.json(order);
}

export async function postCancel(req: Request, res: Response) {
  const order = await svc.cancelOrder(req.params.id);
  res.json(order);
}

export async function deleteOrder(req: Request, res: Response) {
  await svc.deleteOrder(req.params.id);
  res.status(204).end();
}
