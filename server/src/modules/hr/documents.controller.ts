import type { Request, Response } from "express";
import * as documentsService from "./documents.service";

export async function getDocuments(req: Request, res: Response) {
  res.json(await documentsService.listDocuments(req.params.employeeId));
}

export async function postDocument(req: Request, res: Response) {
  const { name, fileDataUrl } = req.body ?? {};
  if (!name || !fileDataUrl) {
    res.status(400).json({ error: "Nome e arquivo são obrigatórios" });
    return;
  }
  const document = await documentsService.createDocument({
    employeeId: req.params.employeeId,
    name,
    fileDataUrl,
    uploadedById: req.user!.sub,
  });
  res.status(201).json(document);
}

export async function deleteDocument(req: Request, res: Response) {
  await documentsService.deleteDocument(req.params.id);
  res.status(204).send();
}
