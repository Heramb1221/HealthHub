import { Brand } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-6xl px-4 py-5">
        <Brand />
      </header>
      <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 pt-6 pb-16">
        {children}
      </main>
    </div>
  );
}
