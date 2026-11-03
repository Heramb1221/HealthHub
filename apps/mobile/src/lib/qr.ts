/**
 * The address encoded in the health-card QR. It holds only the Health ID inside a link, never medical data.
 * Prefer the address the API produced when it is a web link; otherwise build one from the configured web address,
 * so a card never carries an unusable (custom-scheme, localhost) code.
 */
export function healthCardQrUrl(healthId: string, serverUrl: string | null | undefined, webBase: string): string {
  const id = encodeURIComponent(healthId);
  if (serverUrl && /^https:\/\/[^\s/]+\.[^\s/]+\//i.test(serverUrl) && serverUrl.endsWith(`/qr/${id}`)) return serverUrl;
  return `${webBase.replace(/\/+$/, "")}/qr/${id}`;
}
