const AVATAR_COLORS = [
  "#e53935","#d81b60","#8e24aa","#5e35b1","#3949ab",
  "#1e88e5","#039be5","#00acc1","#00897b","#43a047",
  "#7cb342","#f4511e","#fb8c00","#fdd835","#6d4c41",
  "#546e7a","#00838f","#2e7d32","#6a1b9a","#0277bd",
];

function nameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({
  name,
  avatarUrl,
  size = "sm",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md";
}) {
  const dimension = size === "sm" ? "h-6 w-6 text-[10px]" : "h-9 w-9 text-sm";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={name}
        className={`inline-block rounded-full object-cover ${dimension}`}
      />
    );
  }

  return (
    <span
      title={name}
      style={{ backgroundColor: nameColor(name) }}
      className={`inline-flex items-center justify-center rounded-full text-white font-semibold ${dimension}`}
    >
      {initials(name)}
    </span>
  );
}
