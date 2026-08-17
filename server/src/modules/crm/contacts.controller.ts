import type { Request, Response } from "express";
import * as contactsService from "./contacts.service";

export async function getContacts(_req: Request, res: Response) {
  res.json(await contactsService.listContacts());
}

export async function getContactById(req: Request, res: Response) {
  res.json(await contactsService.getContact(req.params.id));
}

export async function postContact(req: Request, res: Response) {
  const { name, company, email, phone, notes } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: "Nome é obrigatório" });
    return;
  }
  res.status(201).json(await contactsService.createContact({ name, company, email, phone, notes }));
}

export async function patchContact(req: Request, res: Response) {
  const { name, company, email, phone, notes } = req.body ?? {};
  res.json(await contactsService.updateContact(req.params.id, { name, company, email, phone, notes }));
}

export async function deleteContact(req: Request, res: Response) {
  await contactsService.deleteContact(req.params.id);
  res.status(204).send();
}

export async function postImportContacts(req: Request, res: Response) {
  const { contacts } = req.body ?? {};
  if (!Array.isArray(contacts) || contacts.length === 0) {
    res.status(400).json({ error: "Envie uma lista de contatos para importar" });
    return;
  }
  const rows = contacts
    .filter((c) => c && typeof c.name === "string")
    .slice(0, 5000)
    .map((c) => ({
      name: c.name,
      company: c.company ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      notes: c.notes ?? null,
    }));
  res.status(201).json(await contactsService.importContacts(rows));
}
