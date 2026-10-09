import { API_MODE } from "@/lib/api/config";

/**
 * Slice 1 placeholder. Replaced by the public landing page in slice 2.
 * Shows which API mode the build is using so a misconfigured environment is obvious.
 */
export default function Home() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl">HealthHub web</h1>
      <p className="text-muted-foreground mt-3">
        Foundation build. API mode: <code className="bg-muted rounded-sm px-1.5 py-0.5 text-sm">{API_MODE}</code>
      </p>
    </main>
  );
}
