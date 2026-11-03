import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-card placeholder:text-muted-foreground h-11 w-full min-w-0 rounded-lg border px-3.5 py-2 text-base shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-primary/40 focus-visible:border-ring md:text-sm",
        "file:text-foreground file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-70",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
