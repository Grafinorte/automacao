import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function StageHeader({
  name,
  dealCount,
  totalValue,
  canMoveLeft,
  canMoveRight,
  onRename,
  onMoveLeft,
  onMoveRight,
}: {
  name: string;
  dealCount: number;
  totalValue: number;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onRename: (name: string) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  function commit() {
    setEditing(false);
    if (value.trim() && value.trim() !== name) {
      onRename(value.trim());
    } else {
      setValue(name);
    }
  }

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="w-32 rounded border border-brand px-1 text-sm font-semibold"
          />
        ) : (
          <h3
            onClick={() => isAdmin && setEditing(true)}
            className={`text-sm font-semibold text-gray-700 ${isAdmin ? "cursor-pointer hover:text-brand" : ""}`}
          >
            {name} <span className="text-gray-400">({dealCount})</span>
          </h3>
        )}
        {isAdmin && (
          <div className="flex gap-1 text-gray-400">
            <button
              disabled={!canMoveLeft}
              onClick={onMoveLeft}
              className="disabled:opacity-30 hover:text-brand"
              title="Mover estágio para a esquerda"
            >
              ◀
            </button>
            <button
              disabled={!canMoveRight}
              onClick={onMoveRight}
              className="disabled:opacity-30 hover:text-brand"
              title="Mover estágio para a direita"
            >
              ▶
            </button>
          </div>
        )}
      </div>
      {dealCount > 0 && <p className="text-xs text-gray-400">{formatCurrency(totalValue)}</p>}
    </div>
  );
}
