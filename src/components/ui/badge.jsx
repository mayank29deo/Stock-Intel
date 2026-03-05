import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, variant = "default", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        variant === "outline"
          ? "border-slate-300 bg-white text-slate-700"
          : "border-transparent bg-blue-600 text-white",
        className
      )}
      {...props}
    />
  );
}