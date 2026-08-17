import { Draggable } from "@hello-pangea/dnd";
import type { Task } from "../../types";
import { PriorityBadge } from "../common/PriorityBadge";
import { Avatar } from "../common/Avatar";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function isImage(fileName: string) {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

function isOverdue(value: string): boolean {
  const due = new Date(value);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
}

export function TaskCard({
  task,
  index,
  onClick,
}: {
  task: Task;
  index: number;
  onClick: () => void;
}) {
  const imageAttachments = (task.attachments ?? []).filter((a) => isImage(a.fileName));
  const coverImage = imageAttachments[0] ?? null;
  const nonImageCount = (task.attachments ?? []).filter((a) => !isImage(a.fileName)).length;
  const totalAttachCount = (task.attachments ?? []).length;
  const subtasks = task.subtasks ?? [];
  const doneSubtasks = subtasks.filter((s) => s.done).length;

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`mb-2.5 cursor-pointer overflow-hidden rounded-xl border border-[rgba(199,198,202,0.25)] bg-white shadow-sm transition-all duration-150 hover:shadow-md dark:border-white/8 dark:bg-[#1c1e22] ${
            snapshot.isDragging ? "shadow-lg ring-2 ring-[#005cba]/30 dark:ring-[#005cba]/40" : ""
          }`}
        >
          {/* Cover image */}
          {coverImage && (
            <div className="h-36 w-full overflow-hidden bg-[#f4f4f6] dark:bg-[#111214]">
              <img
                src={coverImage.fileUrl}
                alt={coverImage.fileName}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
          )}

          {/* Content */}
          <div className="p-3.5">
            <p className="text-[13px] font-medium leading-snug text-[#1a1c1d] dark:text-[#e0e0e2]">
              {task.title}
            </p>

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <PriorityBadge priority={task.priority} />
              {/* Assignee + member avatars */}
              {(task.assignee || (task.members && task.members.length > 0)) && (
                <div className="flex items-center -space-x-1.5">
                  {task.assignee && (
                    <div className="ring-1 ring-white dark:ring-[#1c1e22] rounded-full">
                      <Avatar name={task.assignee.name} avatarUrl={task.assignee.avatarUrl} />
                    </div>
                  )}
                  {(task.members ?? []).slice(0, 3).map(({ user }) => (
                    <div key={user.id} className="ring-1 ring-white dark:ring-[#1c1e22] rounded-full">
                      <Avatar name={user.name} avatarUrl={user.avatarUrl} />
                    </div>
                  ))}
                  {(task.members ?? []).length > 3 && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f3f3f5] text-[9px] font-bold text-[#46464a] ring-1 ring-white dark:bg-[#222426] dark:text-[#a0a0a4] dark:ring-[#1c1e22]">
                      +{(task.members ?? []).length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Subtask progress */}
            {subtasks.length > 0 && (
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex-1 h-1 overflow-hidden rounded-full bg-[#e8e8ea] dark:bg-[#2a2c30]">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.round((doneSubtasks / subtasks.length) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-[#77767b] dark:text-[#a0a0a4]">
                  {doneSubtasks}/{subtasks.length}
                </span>
              </div>
            )}

            {/* Footer: due date + attachment count */}
            {(task.dueDate || totalAttachCount > 0) && (
              <div className="mt-2 flex items-center justify-between gap-2">
                {task.dueDate ? (
                  <p className={`text-[11px] font-medium ${
                    isOverdue(task.dueDate) ? "text-red-500" : "text-[#77767b] dark:text-[#a0a0a4]"
                  }`}>
                    Prazo: {formatDate(task.dueDate)}
                  </p>
                ) : <span />}

                {totalAttachCount > 0 && (
                  <div className="flex items-center gap-2.5 text-[#77767b] dark:text-[#a0a0a4]">
                    {/* image count */}
                    {imageAttachments.length > 0 && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                        {imageAttachments.length}
                      </span>
                    )}
                    {/* file count */}
                    {nonImageCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                        </svg>
                        {nonImageCount}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
