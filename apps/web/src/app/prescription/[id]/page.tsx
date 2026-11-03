import { notFound, redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Target of the QR code printed on prescription PDFs (`<link base>prescription/<id>`). It forwards to the
 * protected prescription page, which requires sign-in and checks ownership/consent before showing anything.
 */
export default async function PrescriptionQrRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  redirect(`/prescriptions/${id}`);
}
