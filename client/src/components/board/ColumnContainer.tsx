import { Droppable } from "@hello-pangea/dnd";
import type { Column, Task } from "../../types";
import { TaskCard } from "./TaskCard";
import { ColumnHeader } from "./ColumnHeader";

export function ColumnContainer({
  column,
  canMoveLeft,
  canMoveRight,
  onRename,
  onMoveLeft,
  onMoveRight,
  onTaskClick,
}: {
  column: Column;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onRename: (name: string) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onTaskClick: (task: Task) => void;
}) {
  return (
    <div className="flex w-72 flex-shrink-0 flex-col rounded-xl bg-gray-50/80 p-3">
      <ColumnHeader
        name={column.name}
        taskCount={column.tasks.length}
        canMoveLeft={canMoveLeft}
        canMoveRight={canMoveRight}
        onRename={onRename}
        onMoveLeft={onMoveLeft}
        onMoveRight={onMoveRight}
      />
      <Droppable droppableId={column.id}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="min-h-[40px] flex-1"
          >
            {column.tasks.map((task, index) => (
              <TaskCard key={task.id} task={task} index={index} onClick={() => onTaskClick(task)} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
