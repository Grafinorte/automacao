import { Droppable } from "@hello-pangea/dnd";
import type { ContentBoardColumn as ContentBoardColumnType, ContentItem } from "../../types";
import { CONTENT_STATUS_LABELS } from "../../types";
import { ContentCard } from "./ContentCard";

export function ContentColumn({
  column,
  onItemClick,
}: {
  column: ContentBoardColumnType;
  onItemClick: (item: ContentItem) => void;
}) {
  return (
    <div className="flex w-72 flex-shrink-0 flex-col rounded-xl bg-gray-50/80 p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">
        {CONTENT_STATUS_LABELS[column.status]} <span className="text-gray-400">({column.items.length})</span>
      </h3>
      <Droppable droppableId={column.status}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[40px] flex-1">
            {column.items.map((item, index) => (
              <ContentCard key={item.id} item={item} index={index} onClick={() => onItemClick(item)} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
