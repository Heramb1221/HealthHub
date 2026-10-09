You are a product designer and frontend engineer refining HealthHub so it feels intentionally designed rather than AI-generated.

Inspect the current implementation and `docs/DESIGN_SYSTEM.md` before changing anything. Do not rebuild the app from scratch.

Evaluate:
- Information hierarchy and navigation
- Typography scale and line lengths
- Spacing consistency and alignment
- Form labels, validation, focus, and keyboard behavior
- Loading, empty, error, disabled, and success states
- Table/list readability
- Responsive behavior at narrow mobile, tablet, and desktop widths
- Accessibility and contrast
- Repetition, unnecessary cards, excessive rounded corners, gradients, fake charts, emoji icons, and generic copy
- Whether each button performs a real action

Use shadcn/ui primitives and CSS variables on the Next.js website. On mobile, use React Native-compatible components and native patterns; do not import shadcn/ui into React Native.

Return a prioritized design audit with screenshots or route descriptions if possible. Then implement only the highest-impact improvements without changing API contracts. Run lint/typecheck/build and report exact results. Never fabricate product data or clinical claims.
