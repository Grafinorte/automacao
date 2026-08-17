import type { Request, Response } from "express";
import * as boardService from "./board.service";

export async function getBoards(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  const userRole = req.user!.role as string;
  res.json(await boardService.listBoards(userId, userRole));
}

export async function getBoardById(req: Request, res: Response) {
  const userId = req.user!.sub as string;
  const userRole = req.user!.role as string;
  const isAdmin = userRole === "ADMIN";
  const queryUser = typeof req.query.user === "string" ? req.query.user : undefined;
  const assigneeId = isAdmin && queryUser ? queryUser : userId;
  res.json(await boardService.getBoard(req.params.boardId, userId, userRole, assigneeId));
}

export async function postBoard(req: Request, res: Response) {
  const { name, description } = req.body ?? {};
  if (!name?.trim()) { res.status(400).json({ error: "Nome obrigatório" }); return; }
  res.status(201).json(await boardService.createBoard(name.trim(), description));
}

export async function deleteBoard(req: Request, res: Response) {
  await boardService.deleteBoard(req.params.boardId);
  res.status(204).send();
}

export async function getBoardMembers(req: Request, res: Response) {
  res.json(await boardService.listBoardMembers(req.params.boardId));
}

export async function postBoardMember(req: Request, res: Response) {
  const { userId } = req.body ?? {};
  if (!userId) { res.status(400).json({ error: "userId obrigatório" }); return; }
  await boardService.addBoardMember(req.params.boardId, userId);
  res.status(204).send();
}

export async function deleteBoardMember(req: Request, res: Response) {
  await boardService.removeBoardMember(req.params.boardId, req.params.userId);
  res.status(204).send();
}

export async function postColumn(req: Request, res: Response) {
  const { name, boardId } = req.body ?? {};
  if (!name || !boardId) { res.status(400).json({ error: "name e boardId são obrigatórios" }); return; }
  res.status(201).json(await boardService.addColumn(boardId, name));
}

export async function patchColumn(req: Request, res: Response) {
  const { name } = req.body ?? {};
  if (!name) { res.status(400).json({ error: "Nome da coluna é obrigatório" }); return; }
  res.json(await boardService.renameColumn(req.params.id, name));
}

export async function patchColumnsReorder(req: Request, res: Response) {
  const { orderedColumnIds } = req.body ?? {};
  if (!Array.isArray(orderedColumnIds)) { res.status(400).json({ error: "orderedColumnIds deve ser uma lista" }); return; }
  await boardService.reorderColumns(orderedColumnIds);
  res.status(204).send();
}

export async function deleteColumn(req: Request, res: Response) {
  await boardService.deleteColumn(req.params.id);
  res.status(204).send();
}
