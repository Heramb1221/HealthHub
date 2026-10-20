"use client";

import * as React from "react";

export function useDocumentTitle(title: string | null | undefined) {
  React.useEffect(() => {
    if (title) document.title = `${title} · Sehat Med`;
  }, [title]);
}
