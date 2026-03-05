import * as React from "react";
import { cn } from "@/lib/utils";

const TabsContext = React.createContext(null);

export function Tabs({ defaultValue, value, onValueChange, className, children }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = value ?? internalValue;

  const setValue = (next) => {
    if (onValueChange) onValueChange(next);
    if (value === undefined) setInternalValue(next);
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, setValue }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }) {
  return <div className={cn("inline-flex rounded-md bg-slate-100 p-1", className)} {...props} />;
}

export function TabsTrigger({ value, className, children }) {
  const ctx = React.useContext(TabsContext);
  const active = ctx?.value === value;

  return (
    <button
      type="button"
      data-state={active ? "active" : "inactive"}
      aria-selected={active}
      onClick={() => ctx?.setValue(value)}
      className={cn(
        "rounded px-3 py-1.5 text-sm",
        active ? "bg-white shadow text-slate-900" : "text-slate-600",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }) {
  const ctx = React.useContext(TabsContext);
  if (ctx?.value !== value) return null;
  return <div className={cn("w-full", className)}>{children}</div>;
}