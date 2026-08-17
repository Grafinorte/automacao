import type { Request, Response } from "express";
import * as tasksService from "./tasks.service";

export async function getTasks(req: Request, res: Response) {
  const assigneeId = typeof req.query.assigneeId === "string" ? req.query.assigneeId : undefined;
  res.json(await tasksService.listTasks(assigneeId));
}

export async function getTaskById(req: Request, res: Response) {
  res.json(await tasksService.getTask(req.params.id));
}

export async function postTask(req: Request, res: Response) {
  const { title, description, columnId, priority, dueDate } = req.body ?? {};
  const isAdmin = req.user!.role === "ADMIN";
  if (!title || !columnId) {
    res.status(400).json({ error: "title e columnId são obrigatórios" });
    return;
  }
  // Non-admin: task is always assigned to themselves
  const assigneeId = isAdmin ? (req.body?.assigneeId ?? req.user!.sub) : req.user!.sub;
  const task = await tasksService.createTask({
    title,
    description,
    columnId,
    assigneeId,
    priority,
    dueDate,
    createdById: req.user!.sub,
  });
  res.status(201).json(task);
}

async function assertTaskOwner(req: Request, res: Response): Promise<boolean> {
  if (req.user!.role === "ADMIN") return true;
  const task = await tasksService.getTask(req.params.id);
  if (task.assignee?.id !== req.user!.sub) {
    res.status(403).json({ error: "Sem permissão para modificar esta tarefa" });
    return false;
  }
  return true;
}

export async function patchTask(req: Request, res: Response) {
  if (!(await assertTaskOwner(req, res))) return;
  const { title, description, priority, dueDate } = req.body ?? {};
  const isAdmin = req.user!.role === "ADMIN";
  const assigneeId = isAdmin ? req.body?.assigneeId : undefined;
  const task = await tasksService.updateTask(req.params.id, {
    title,
    description,
    assigneeId,
    priority,
    dueDate,
  });
  res.json(task);
}

export async function deleteTask(req: Request, res: Response) {
  if (!(await assertTaskOwner(req, res))) return;
  await tasksService.deleteTask(req.params.id);
  res.status(204).send();
}

export async function moveTask(req: Request, res: Response) {
  if (!(await assertTaskOwner(req, res))) return;
  const { toColumnId, toIndex } = req.body ?? {};
  if (!toColumnId || typeof toIndex !== "number") {
    res.status(400).json({ error: "toColumnId e toIndex são obrigatórios" });
    return;
  }
  await tasksService.moveTask(req.params.id, toColumnId, toIndex);
  res.status(204).send();
}

export async function postTaskAttachment(req: Request, res: Response) {
  const { dataUrl, fileName } = req.body ?? {};
  if (!dataUrl || !fileName) {
    res.status(400).json({ error: "dataUrl e fileName são obrigatórios" });
    return;
  }
  const attachment = await tasksService.addTaskAttachment(req.params.id, req.user!.sub, dataUrl, fileName);
  res.status(201).json(attachment);
}

export async function deleteTaskAttachment(req: Request, res: Response) {
  await tasksService.removeTaskAttachment(req.params.attachmentId);
  res.status(204).send();
}

export async function postSubtask(req: Request, res: Response) {
  const { title } = req.body ?? {};
  if (!title?.trim()) { res.status(400).json({ error: "Título obrigatório" }); return; }
  const subtask = await tasksService.createSubtask(req.params.id, title.trim());
  res.status(201).json(subtask);
}

export async function patchSubtask(req: Request, res: Response) {
  const { done } = req.body ?? {};
  if (typeof done !== "boolean") { res.status(400).json({ error: "done (boolean) obrigatório" }); return; }
  const subtask = await tasksService.toggleSubtask(req.params.subtaskId, done);
  res.json(subtask);
}

export async function deleteSubtask(req: Request, res: Response) {
  await tasksService.deleteSubtask(req.params.subtaskId);
  res.status(204).send();
}

export async function postTaskMember(req: Request, res: Response) {
  const { userId } = req.body ?? {};
  if (!userId) { res.status(400).json({ error: "userId obrigatório" }); return; }
  const task = await tasksService.addTaskMember(req.params.id, userId);
  res.status(201).json(task);
}

export async function deleteTaskMember(req: Request, res: Response) {
  const task = await tasksService.removeTaskMember(req.params.id, req.params.userId);
  res.json(task);
}
