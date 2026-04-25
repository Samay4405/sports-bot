import { cn } from "../../lib";

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
