# Part 9A design handoff (web foundation)

Audience: the second web agent and the integration agent.

## Compatibility
No exported component names, prop contracts, or existing CSS variables were removed. `components/ui/button.tsx` is unchanged. All existing utility classes and tokens (`text-muted-foreground`, `bg-primary`, `text-info`, `bg-*-surface`, `shadow-soft`, `shadow-lift`, `surface`, `surface-hover`, `glass`, `text-gradient`, `bg-hero`, `skeleton-shimmer`) still exist with the same meaning.

## New tokens (additive, in `app/globals.css`)
- `--elevation-0` to `--elevation-3`: shadow scale. Level 1 is a resting card, 2 is `--shadow-soft`, 3 is an overlay. Exposed to Tailwind as `shadow-elevation-1` and `shadow-elevation-3`.
- `--focus-ring`: the single focus indicator (`box-shadow`) applied by the global `:focus-visible` rule. Use it instead of ad hoc `ring-*` on new controls.
- `--duration-fast` (150ms), `--duration-base` (220ms), `--duration-slow` (380ms), `--ease-standard`: motion timing. Motion is disabled globally under `prefers-reduced-motion`.

## Changed primitives
- `Input` and `Textarea`: radius `rounded-lg`, shared hover border and focus transition. Heights and props are unchanged.
- `Skeleton`: now uses the existing `skeleton-shimmer` animation. It is still `aria-hidden`, and the shimmer stops under reduced motion.

## Shared chrome
- `SiteHeader` (marketing): actions are tighter on small screens; the mobile sign-up label reads "Join" and the full label appears from `sm` up. Localization owner should confirm this copy.
- `Brand`: the logo is shrink-proof.
- `(auth)/layout.tsx`: centred column with a footer note. Clerk's card is not wrapped in a second surface.

## Known constraint for other owners
`components/feedback/states.tsx` (`ErrorState`, `EmptyState`) is outside this patch's ownership. It still uses `rounded-md` and `border-destructive/30` directly. It works, but should move to `rounded-lg` and `surface` styling when its owner is available.
