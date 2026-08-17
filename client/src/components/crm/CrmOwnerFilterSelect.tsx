import type { TaskUserRef } from "../../types";

export function CrmOwnerFilterSelect({
  owner,
  onChange,
  salespeople,
  currentUserId,
}: {
  owner: string;
  onChange: (value: string) => void;
  salespeople: TaskUserRef[];
  currentUserId: string;
}) {
  return (
    <select
      value={owner}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-brand focus:outline-none"
    >
      <option value="me">Meus negócios</option>
      <option value="all">Todos os negócios</option>
      {salespeople
        .filter((u) => u.id !== currentUserId)
        .map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
    </select>
  );
}
