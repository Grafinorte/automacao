import type { Request, Response } from "express";
import * as productsService from "./products.service";

export async function getProducts(req: Request, res: Response) {
  const includeInactive = req.user?.role === "ADMIN" && req.query.all === "true";
  res.json(await productsService.listProducts(includeInactive));
}

export async function postProduct(req: Request, res: Response) {
  const { name, specifications, unitPrice } = req.body ?? {};
  if (!name || !specifications) {
    res.status(400).json({ error: "Nome e especificações são obrigatórios" });
    return;
  }
  res.status(201).json(await productsService.createProduct({ name, specifications, unitPrice }));
}

export async function patchProduct(req: Request, res: Response) {
  const { name, specifications, unitPrice, active } = req.body ?? {};
  res.json(
    await productsService.updateProduct(req.params.id, { name, specifications, unitPrice, active })
  );
}

export async function deleteProduct(req: Request, res: Response) {
  await productsService.deleteProduct(req.params.id);
  res.status(204).send();
}
