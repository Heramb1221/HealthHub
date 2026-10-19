import Link from "next/link";
import { CalendarClock, FileText, History, Hospital, IdCard, TriangleAlert } from "lucide-react";

import { PrescriptionIllustration } from "@/components/marketing/prescription-illustration";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const CAPABILITIES = [
  {
    icon: FileText,
    title: "Prescriptions",
    body: "Upload a photo or PDF. Sehat Med keeps your original file untouched and shows what it read from it next to the original.",
  },
  {
    icon: CalendarClock,
    title: "Medication schedule",
    body: "Reminders are built only from prescriptions with complete, clearly read details. You record whether you took or skipped each dose.",
  },
  {
    icon: History,
    title: "Medical history",
    body: "Conditions and records in one timeline. Each entry shows where it came from and whether anyone has verified it.",
  },
  {
    icon: IdCard,
    title: "Digital health card",
    body: "A card with your Sehat Med ID and a QR code. The QR holds a random reference, never your medical details.",
  },
  {
    icon: Hospital,
    title: "Hospitals and appointments",
    body: "Browse listed hospitals, check open slots and book one. A slot can only be booked once.",
  },
] as const;

const STEPS = [
  { title: "Upload", body: "Add an image or PDF of your prescription. The file is stored privately." },
  { title: "Read", body: "Sehat Med extracts the details and records how confident it is in each one." },
  { title: "Review", body: "You check the details against your paper copy and correct anything wrong. Your corrections are kept alongside the original reading." },
  { title: "Use", body: "Complete details can feed your schedule and health card. Unclear ones stay marked until you review them." },
] as const;

const NOT_YET = [
  "Autonomous medical diagnosis or altering physician prescriptions",
  "Live bank settlement (sandbox mode only)",
  "Real insurance underwriting decisions",
  "Government ABDM mandatory registry data linking",
];


export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-20">
          <div className="space-y-6">
            <h1 className="max-w-xl text-4xl leading-tight sm:text-5xl">Your prescriptions and medicines, in one record you control</h1>
            <p className="text-muted-foreground max-w-lg text-lg">
              Upload a prescription, check what was read from it, and keep your medication schedule and medical history together. Sehat Med always shows what
              has and hasn’t been verified.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">Create account</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
          </div>
          <PrescriptionIllustration />
        </section>

        <section aria-labelledby="capabilities" className="border-t">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1fr_2fr]">
            <h2 id="capabilities" className="text-2xl">
              What you can keep in Sehat Med
            </h2>
            <dl className="divide-y">
              {CAPABILITIES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="py-5 first:pt-0">
                  <dt className="flex items-center gap-3 font-semibold">
                    <Icon aria-hidden="true" className="text-accent-foreground size-5 shrink-0" />
                    {title}
                  </dt>
                  <dd className="text-muted-foreground mt-1 max-w-prose pl-8">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="how" className="bg-card border-y">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 id="how" className="text-2xl">
              How a prescription is handled
            </h2>
            <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="space-y-2 border-t-2 border-primary pt-4">
                  <p className="text-muted-foreground text-sm">Step {index + 1}</p>
                  <h3 className="text-lg">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="limits" className="mx-auto grid max-w-6xl gap-8 px-4 py-14 lg:grid-cols-[1fr_2fr]">
          <h2 id="limits" className="text-2xl">
            What Sehat Med does not do
          </h2>
          <div className="max-w-prose space-y-6">
            <Alert tone="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Check every reading against your paper prescription</AlertTitle>
              <AlertDescription>
                <p>
                  Automatic reading can be wrong. Sehat Med does not diagnose, prescribe or change treatment, and a correction you make is not a
                  clinician’s verification. Follow your doctor or pharmacist for how to take any medicine.
                </p>
              </AlertDescription>
            </Alert>
            <div>
              <h3 className="text-base">Not available yet</h3>
              <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5">
                {NOT_YET.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
