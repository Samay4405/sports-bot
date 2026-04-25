import { cn } from "../../lib";

export function Card({ className, ...props }) {
  return <div className={cn("glass rounded-2xl border border-white/70 p-5 shadow-card", className)} {...props} />;
}
