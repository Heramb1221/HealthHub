import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-card placeholder:text-muted-foreground min-h-24 w-full rounded-lg border px-3.5 py-2 text-base shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-primary/40 focus-visible:border-ring md:text-sm",
        "disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
