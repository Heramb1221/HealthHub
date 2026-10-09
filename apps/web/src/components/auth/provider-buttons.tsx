import { Button } from "@/components/ui/button";

/**
 * Third-party sign-in is not configured: the API contract has no provider endpoints, so these stay disabled.
 * They are shown (rather than hidden) so people know the option is planned, with the reason stated.
 */
export function ProviderButtons() {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" disabled aria-describedby="providers-note">
          Continue with Google
        </Button>
        <Button variant="outline" disabled aria-describedby="providers-note">
          Continue with Apple
        </Button>
      </div>
      <p id="providers-note" className="text-muted-foreground text-sm">
        Google and Apple sign-in aren’t set up in this environment. Use your email and password.
      </p>
    </div>
  );
}
