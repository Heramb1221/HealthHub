import Link from "next/link";
import { ArrowRight, CalendarClock, FileText, HeartPulse, History, Hospital, IdCard, Lock, QrCode, ShieldCheck, TriangleAlert } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { PrescriptionIllustration } from "@/components/marketing/prescription-illustration";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const CAPABILITIES = [
  {
    icon: FileText,
    title: "Prescriptions",
    body: "Upload a photo or PDF. Sehat Meds keeps your original file untouched and shows what it read from it next to the original.",
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
    body: "A card with your Sehat Meds ID and a QR code. The QR holds a random reference, never your medical details.",
  },
  {
    icon: Hospital,
    title: "Hospitals and appointments",
    body: "Browse listed hospitals, check open slots and book one. A slot can only be booked once.",
  },
] as const;

const STEPS = [
  { title: "Upload", body: "Add an image or PDF of your prescription. The file is stored privately." },
  { title: "Read", body: "Sehat Meds extracts the details and records how confident it is in each one." },
  { title: "Review", body: "You check the details against your paper copy and correct anything wrong. Your corrections are kept alongside the original reading." },
  { title: "Use", body: "Complete details can feed your schedule and health card. Unclear ones stay marked until you review them." },
] as const;

const NOT_YET = [
  "Autonomous medical diagnosis or altering physician prescriptions",
  "Live online payments until a Razorpay account is activated (test mode only today)",
  "Real insurance underwriting decisions",
  "Government ABDM mandatory registry data linking",
];

const TRUST = [
  { icon: Lock, label: "Your original file is never changed" },
  { icon: ShieldCheck, label: "Every reading is marked until you confirm it" },
  { icon: QrCode, label: "QR codes hold a reference, not your records" },
] as const;

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="bg-hero border-b">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-20">
            <Reveal className="space-y-6">
              <p className="bg-accent text-accent-foreground inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold">
                <HeartPulse aria-hidden="true" className="size-4" /> Bharat ka apna Saathi
              </p>
              <h1 className="max-w-xl text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
                Your prescriptions and medicines, in <span className="text-gradient">one record you control</span>
              </h1>
              <p className="text-muted-foreground max-w-lg text-lg">
                Upload a prescription, check what was read from it, and keep your medication schedule and medical history together. Sehat Meds always shows what
                has and hasn’t been verified.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/sign-up">
                    Create account <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
              </div>
              <ul className="text-muted-foreground grid gap-2 pt-2 text-sm">
                {TRUST.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-2">
                    <Icon aria-hidden="true" className="text-primary size-4 shrink-0" /> {label}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="glass rounded-2xl p-2 sm:p-3">
                <PrescriptionIllustration />
              </div>
            </Reveal>
          </div>
        </section>

        <section aria-labelledby="capabilities" className="mx-auto max-w-6xl px-4 py-16">
          <Reveal>
            <h2 id="capabilities" className="text-2xl font-bold tracking-tight sm:text-3xl">
              What you can keep in Sehat Meds
            </h2>
          </Reveal>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, body }, i) => (
              <li key={title}>
                <Reveal delay={i * 0.05} className="surface surface-hover h-full p-5">
                  <span className="bg-accent text-accent-foreground mb-3 inline-flex size-10 items-center justify-center rounded-xl">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">{body}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how" className="border-y bg-white/60">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 id="how" className="text-2xl font-bold tracking-tight sm:text-3xl">
              How a prescription is handled
            </h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <Reveal delay={index * 0.06} className="space-y-2">
                    <span className="from-primary to-navy flex size-9 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white">{index + 1}</span>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="text-muted-foreground text-sm">{step.body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="limits" className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:grid-cols-[1fr_2fr]">
          <h2 id="limits" className="text-2xl font-bold tracking-tight">
            What Sehat Meds does not do
          </h2>
          <div className="max-w-prose space-y-6">
            <Alert tone="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Check every reading against your paper prescription</AlertTitle>
              <AlertDescription>
                <p>
                  Automatic reading can be wrong. Sehat Meds does not diagnose, prescribe or change treatment, and a correction you make is not a
                  clinician’s verification. Follow your doctor or pharmacist for how to take any medicine.
                </p>
              </AlertDescription>
            </Alert>
            <div>
              <h3 className="text-base font-semibold">Not available yet</h3>
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
