import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-md border px-4 py-3 text-sm has-[>svg]:grid-cols-[1.25rem_1fr] has-[>svg]:gap-x-3 [&>svg]:mt-0.5 [&>svg]:size-5",
  {
    variants: {
      tone: {
        neutral: "border-border bg-card",
        info: "border-info/30 bg-info-surface text-foreground [&>svg]:text-info",
        success: "border-success/30 bg-success-surface text-foreground [&>svg]:text-success",
        warning: "border-warning/40 bg-warning-surface text-foreground [&>svg]:text-warning",
        danger: "border-destructive/30 bg-danger-surface text-foreground [&>svg]:text-destructive",
        demo: "border-demo/30 bg-demo-surface text-foreground [&>svg]:text-demo",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Alert({ className, tone, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ tone }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 font-semibold", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-muted-foreground col-start-2 text-sm [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
