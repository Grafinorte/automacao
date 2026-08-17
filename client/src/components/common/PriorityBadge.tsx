import type { Priority } from "../../types";

const LABELS: Record<Priority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
};

const CLASSES: Record<Priority, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-brand/10 text-brand-dark",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASSES[priority]}`}>
      {LABELS[priority]}
    </span>
  );
}
