import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({ className, value = 0 }) {
  const safe = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-slate-200", className)}>
      <div className="h-full bg-blue-600 transition-all" style={{ width: `${safe}%` }} />
    </div>
  );
}