import qrcode from "qrcode-generator";

/** QR matrix (true = dark) for a text payload, medium error correction. */
export function qrMatrix(payload: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  const count = qr.getModuleCount();
  return Array.from({ length: count }, (_row, r) => Array.from({ length: count }, (_col, c) => qr.isDark(r, c)));
}
