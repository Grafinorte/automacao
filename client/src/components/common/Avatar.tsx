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
      className={`inline-flex items-center justify-center rounded-full bg-brand-black text-white font-semibold ${dimension}`}
    >
      {initials(name)}
    </span>
  );
}
