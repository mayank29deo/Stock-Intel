import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({ className, variant = "default", type = "button", ...props }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors",
        variant === "outline"
          ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          : "bg-blue-600 text-white hover:bg-blue-700",
        className
      )}
      {...props}
    />
  );
}