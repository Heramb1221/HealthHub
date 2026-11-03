import type { Metadata } from "next";

import { QrResolver } from "@/components/qr/qr-resolver";

interface Props {
  params: Promise<{ reference: string }>;
}

export const metadata: Metadata = {
  title: "Sehat Meds QR code",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function QrLandingPage(props: Props) {
  const { reference } = await props.params;
  return <QrResolver reference={reference} />;
}
