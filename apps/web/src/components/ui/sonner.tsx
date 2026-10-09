"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Toasts report only persisted outcomes. Never toast success before the API call resolves. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-card !text-foreground !border-border !rounded-md",
          description: "!text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
