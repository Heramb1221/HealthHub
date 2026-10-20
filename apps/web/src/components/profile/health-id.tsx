"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function HealthId({ value }: { value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Sehat Med ID copied");
    } catch {
      toast.error("Couldn’t copy", { description: "Select the ID and copy it manually." });
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <code className="bg-muted rounded-sm px-2 py-1 font-mono text-base tracking-wider select-all">{value}</code>
      <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label={`Copy Sehat Med ID ${value}`}>
        <Copy aria-hidden="true" /> Copy
      </Button>
    </span>
  );
}
