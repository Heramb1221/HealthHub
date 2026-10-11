import { Ban, Check, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const CONTAINS = ["A random reference code", "The address of a HealthHub page"];
const NEVER = ["Your name or date of birth", "Medicines, conditions or allergies", "Any prescription or appointment detail", "A password or a long-lived key"];

const STEPS = [
  { title: "Someone scans the code", body: "Their phone opens a HealthHub page. That page shows no medical information." },
  { title: "They need an authorized account", body: "Signing in is required. Hospital administrator accounts don’t get access to medical records." },
  { title: "HealthHub checks your consent", body: "The request is checked against your consent and its purpose before anything is opened." },
  { title: "Access is short and limited", body: "If allowed, it’s a short session that shows only what’s permitted. It ends when it expires, and withdrawing consent stops future access." },
  { title: "It’s recorded", body: "Access is logged. The log is kept even after consent is withdrawn." },
];

export function AccessExplainer() {
  return (
    <div className="space-y-12 print:hidden">
      <section aria-labelledby="contains" className="space-y-4">
        <h2 id="contains" className="text-lg">
          What the QR code holds
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-base">It contains</h3>
            <ul className="space-y-1.5 text-sm">
              {CONTAINS.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check aria-hidden="true" className="text-success mt-0.5 size-4 shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="text-base">It never contains</h3>
            <ul className="space-y-1.5 text-sm">
              {NEVER.map((item) => (
                <li key={item} className="flex gap-2">
                  <Ban aria-hidden="true" className="text-destructive mt-0.5 size-4 shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-muted-foreground max-w-prose text-sm">Because the code is only a reference, a photo or screenshot of it doesn’t show anyone your records. Opening them still needs the steps below.</p>
      </section>

      <section aria-labelledby="how" className="space-y-4">
        <div className="max-w-prose space-y-1">
          <h2 id="how" className="text-lg">
            How protected access is designed to work
          </h2>
          <p className="text-muted-foreground text-sm">These checks run on HealthHub’s servers, not in this app.</p>
        </div>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-primary space-y-1 border-t-2 pt-3">
              <p className="text-muted-foreground text-xs">Step {i + 1}</p>
              <h3 className="text-base">{step.title}</h3>
              <p className="text-muted-foreground text-sm">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="controls" className="bg-card max-w-3xl space-y-3 rounded-md border p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Lock aria-hidden="true" className="text-muted-foreground size-5" />
          <h2 id="controls" className="text-lg">
            Your consent and access controls
          </h2>
          <Badge>Not available yet</Badge>
        </div>
        <p className="text-muted-foreground max-w-prose text-sm">
          Seeing who has opened your record, ending an access session, and withdrawing consent aren’t in this version of the web app. Until they are, don’t rely on this card for care, and
          don’t share it with anyone you don’t trust.
        </p>
      </section>
    </div>
  );
}
