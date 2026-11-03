"use client";

import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

/**
 * Fades and lifts content in as it enters the screen. It never delays medical information for more than a
 * fraction of a second, and does nothing at all for people who have asked their device for reduced motion.
 */
export function Reveal({
  children,
  delay = 0,
  y = 12,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.38, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** A quick, subtle transition between pages in the signed-in app. */
export function PageTransition({ children, routeKey }: { children: React.ReactNode; routeKey: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div key={routeKey} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
