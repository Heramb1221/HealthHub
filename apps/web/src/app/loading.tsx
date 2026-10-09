import { LoadingState } from "@/components/feedback/states";

export default function Loading() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-16">
      <LoadingState label="Loading page" />
    </main>
  );
}
