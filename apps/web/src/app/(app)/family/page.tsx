import type { Metadata } from "next";

import { FamilyTreeView } from "@/components/family/family-tree-view";

export const metadata: Metadata = {
  title: "Family Health Tree",
  description: "Map multi-generational family health history and track hereditary medical patterns.",
};

export default function FamilyPage() {
  return <FamilyTreeView />;
}
