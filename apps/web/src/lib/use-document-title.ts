"use client";

import * as React from "react";

/**
 * Sets a specific page title (e.g. the hospital's name) once the data is known. The static metadata title
 * ("Hospital") is generic, and the title is what a screen reader announces after a client-side navigation.
 * Pass null while loading to leave the static title in place.
 */
export function useDocumentTitle(title: string | null | undefined) {
  React.useEffect(() => {
    if (title) document.title = `${title} · Sehat Med`;
  }, [title]);
}
