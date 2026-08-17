import { Draggable } from "@hello-pangea/dnd";
import type { ContentItem } from "../../types";
import { MARKETING_CHANNEL_LABELS } from "../../types";
import { Avatar } from "../common/Avatar";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

export function ContentCard({
  item,
  index,
  onClick,
}: {
  item: ContentItem;
  index: number;
  onClick: () => void;
}) {
  return (
    <Draggable draggableId={item.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`mb-2.5 cursor-pointer rounded-xl border border-gray-100 bg-white dark:bg-gray-900 p-3.5 shadow-sm transition-shadow hover:shadow-md ${
            snapshot.isDragging ? "shadow-lg ring-2 ring-brand/30" : ""
          }`}
        >
          <p className="text-sm font-medium text-gray-900">{item.title}</p>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {item.type} · {MARKETING_CHANNEL_LABELS[item.channel]}
          </p>
          {item.campaign && (
            <p className="mt-1 truncate text-xs text-brand-dark">{item.campaign.name}</p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {item.scheduledDate ? formatDate(item.scheduledDate) : "Sem data"}
            </span>
            {item.assignee && <Avatar name={item.assignee.name} avatarUrl={item.assignee.avatarUrl} />}
          </div>
        </div>
      )}
    </Draggable>
  );
}
