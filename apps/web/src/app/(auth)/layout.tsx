import { Brand } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-hero flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Brand />
      </header>
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pt-2 pb-16">
        <p className="text-primary mb-5 text-center text-sm font-semibold">Bharat ka apna Saathi</p>
        <div className="flex justify-center">{children}</div>
        <p className="text-muted-foreground mt-6 text-center text-xs">
          Sehat Meds is a personal health-record tool. It does not give medical advice.
        </p>
      </main>
    </div>
  );
}
