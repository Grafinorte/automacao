import { Draggable } from "@hello-pangea/dnd";
import type { Deal } from "../../types";
import { Avatar } from "../common/Avatar";

const COMPANY_LOGOS: Record<string, string> = {
  GRAFINORTE: "/assets/fav-grafinorte.png",
  PLUSPACK:   "/assets/fav-pluspack.png",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

export function DealCard({
  deal,
  index,
  isClosedStage,
  onClick,
}: {
  deal: Deal;
  index: number;
  isClosedStage?: boolean;
  onClick: () => void;
}) {
  const today = new Date(new Date().toDateString());

  const isOverdue =
    !isClosedStage &&
    !!deal.expectedCloseDate &&
    new Date(deal.expectedCloseDate) < today;

  const isFollowUpDue =
    !isClosedStage &&
    !!deal.nextFollowUp &&
    new Date(deal.nextFollowUp) <= today;

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`mb-2.5 cursor-pointer rounded-xl border p-3.5 shadow-sm transition-all hover:shadow-md ${
            snapshot.isDragging ? "shadow-lg ring-2 ring-brand/30" : ""
          } ${
            isOverdue
              ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/25"
              : "border-[rgba(0,0,0,0.06)] bg-white dark:border-white/8 dark:bg-[#1c1e22]"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-[#030304] dark:text-[#e0e0e2] leading-snug">{deal.title}</p>
            {deal.company && COMPANY_LOGOS[deal.company] && (
              <img
                src={COMPANY_LOGOS[deal.company]}
                alt={deal.company}
                className="h-7 w-7 flex-shrink-0 rounded-md object-contain"
              />
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-[#77767b]">
            {deal.contact.name}
            {deal.contact.company ? ` · ${deal.contact.company}` : ""}
          </p>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-brand">{formatCurrency(deal.value)}</span>
            <Avatar name={deal.owner.name} avatarUrl={deal.owner.avatarUrl} />
          </div>

          {deal.expectedCloseDate && (
            <p className={`mt-1.5 text-xs ${isOverdue ? "font-medium text-red-600 dark:text-red-400" : "text-[#77767b]"}`}>
              {isOverdue ? "⚠ Vencido: " : "Prev.: "}
              {formatDate(deal.expectedCloseDate)}
            </p>
          )}

          {!isClosedStage && deal.nextFollowUp && (
            <div className={`mt-1.5 flex items-center gap-1 text-xs ${
              isFollowUpDue
                ? "font-medium text-amber-600 dark:text-amber-400"
                : "text-[#46464a] dark:text-[#a0a0a4]"
            }`}>
              <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 9v7.5" />
              </svg>
              {isFollowUpDue ? "Follow-up: " : "Contato: "}
              {formatDate(deal.nextFollowUp)}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
