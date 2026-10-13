"use client";

import * as React from "react";
import QRCode from "qrcode";

const QUIET_ZONE = 4;

/**
 * Draws a QR code as inline SVG from the text it is given (no images, no innerHTML, nothing sent anywhere).
 * Dark modules on a white tile with a quiet zone, so it scans from a screen or a printout.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = React.useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { size: n + QUIET_ZONE * 2, path: d };
  }, [value]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={className} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#0b1b2b" />
    </svg>
  );
}
