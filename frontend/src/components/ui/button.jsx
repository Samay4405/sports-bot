import { cn } from "../../lib";

export function Button({ className, variant = "default", ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2",
        variant === "default" && "bg-accent text-white hover:bg-teal-700 focus:ring-accent",
        variant === "outline" && "border border-slate-300 bg-white text-ink hover:bg-slate-50",
        variant === "danger" && "bg-rose-700 text-white hover:bg-rose-800",
        variant === "ghost" && "text-ink hover:bg-slate-100",
        className
      )}
      {...props}
    />
  );
}
