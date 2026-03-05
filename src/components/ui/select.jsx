import * as React from "react";
import { cn } from "@/lib/utils";

const SelectContext = React.createContext(null);

export function Select({ value, onValueChange, children }) {
  return (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div>{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className, children }) {
  return (
    <div className={cn("flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm", className)}>
      {children}
    </div>
  );
}

export function SelectValue({ placeholder }) {
  const ctx = React.useContext(SelectContext);
  return <span>{ctx?.value || placeholder}</span>;
}

export function SelectContent({ className, children }) {
  const ctx = React.useContext(SelectContext);

  return (
    <select
      className={cn("mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm sm:w-56", className)}
      value={ctx?.value || ""}
      onChange={(e) => ctx?.onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  );
}

export function SelectItem({ value, children }) {
  return <option value={value}>{children}</option>;
}