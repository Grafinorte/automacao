import { Droppable } from "@hello-pangea/dnd";
import type { CrmStage, Deal } from "../../types";
import { DealCard } from "./DealCard";
import { StageHeader } from "./StageHeader";

export function StageColumn({
  stage,
  canMoveLeft,
  canMoveRight,
  onRename,
  onMoveLeft,
  onMoveRight,
  onDealClick,
}: {
  stage: CrmStage;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onRename: (name: string) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDealClick: (deal: Deal) => void;
}) {
  const totalValue = stage.deals.reduce((sum, d) => sum + d.value, 0);

  const columnBg = stage.isClosed
    ? stage.isWon
      ? "bg-green-100 dark:bg-green-950/30 ring-1 ring-green-200 dark:ring-green-900/40"
      : "bg-red-50 dark:bg-red-950/20 ring-1 ring-red-200 dark:ring-red-900/40"
    : "bg-[#f9f9fb] dark:bg-[#181a1e]";

  return (
    <div className={`flex w-72 flex-shrink-0 flex-col rounded-xl p-3 ${columnBg}`}
      style={{ height: "calc(100vh - 160px)" }}>
      <StageHeader
        name={stage.name}
        dealCount={stage.deals.length}
        totalValue={totalValue}
        canMoveLeft={canMoveLeft}
        canMoveRight={canMoveRight}
        onRename={onRename}
        onMoveLeft={onMoveLeft}
        onMoveRight={onMoveRight}
      />
      <Droppable droppableId={stage.id}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="min-h-[40px] flex-1 overflow-y-auto pr-0.5"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(199,198,202,0.4) transparent" }}
          >
            {stage.deals.map((deal, index) => (
              <DealCard
                key={deal.id}
                deal={deal}
                index={index}
                isClosedStage={stage.isClosed}
                onClick={() => onDealClick(deal)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
