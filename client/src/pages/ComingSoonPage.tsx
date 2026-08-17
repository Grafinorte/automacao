import type { ReactNode } from "react";

export function ComingSoonPage({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand-dark">
        {icon}
      </div>
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <p className="max-w-sm text-sm text-gray-500">{description}</p>
      <span className="mt-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
        Em breve
      </span>
    </div>
  );
}
