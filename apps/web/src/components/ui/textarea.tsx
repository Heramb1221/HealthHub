import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-card placeholder:text-muted-foreground min-h-24 w-full rounded-md border px-3 py-2 text-base md:text-sm",
        "disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
