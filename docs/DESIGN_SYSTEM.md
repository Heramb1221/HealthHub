# HealthHub Design System

## Product character
A calm, precise, trustworthy healthcare utility. It should feel like a thoughtfully designed health product, not a generic AI-generated dashboard.

## Visual direction
- Use a restrained deep navy / clinical blue / muted teal palette with warm neutral surfaces.
- Use one font family consistently; choose a readable UI font such as Inter for web and a system-native stack on mobile.
- Prefer clear hierarchy, whitespace, strong alignment, and meaningful labels.
- Use color for status only when paired with text/icon; never rely on color alone.
- Use a small, consistent spacing scale (4, 8, 12, 16, 24, 32).
- Use moderate corner radii. Do not make every container a giant pill.
- Avoid gradient-heavy hero panels, excessive shadows, random charts, emoji icons, glassmorphism, and identical metric-card grids.
- Use Lucide icons on web (`lucide-react`) and a consistent icon set available in Expo on mobile.
- Include realistic empty, loading, error, disabled, and success states.
- All forms need labels, validation messages, and helpful examples.
- Use accessible contrast, focus states, keyboard navigation, and mobile touch targets.
- Use charts only when there is real meaningful data.

## Web implementation
- Next.js App Router + TypeScript + Tailwind CSS.
- shadcn/ui components are preferred for accessible primitives: Button, Input, Label, Form, Dialog, Sheet, Dropdown Menu, Tabs, Table, Badge, Alert, Skeleton, Toast/Sonner, Calendar where needed.
- Configure shadcn/ui using a coherent preset/theme and CSS variables; do not just paste default examples without adapting tokens.
- Use semantic HTML and reusable feature-level components.
- Use `lucide-react` icons. No emoji as UI icons.
- Data tables need empty states, pagination or a clear limit, and responsive behavior.
- Use server components where useful; client components only where interaction requires them.

## Mobile implementation
- Use Expo + React Native + TypeScript.
- Do not import shadcn/ui into React Native; it targets web React.
- Use a small shared mobile component layer and a consistent React Native-compatible library or NativeWind if already configured.
- Use native navigation patterns, safe areas, keyboard-aware forms, and native pickers.
- Use `expo-image-picker` for image selection/capture and `expo-notifications` for local reminder prototypes where supported.
- Provide permission-denied and unavailable-device states.

## Required core screens
Patient web/mobile:
1. Sign in / sign up
2. Dashboard
3. Patient profile
4. Prescription list
5. Prescription upload and processing status
6. Prescription detail with extracted fields and verification state
7. Medication schedule
8. Medical history
9. Digital health card / QR access
10. Hospitals and appointment booking

Admin web:
1. Admin sign-in / protected layout
2. Hospital list with search and status
3. Create/edit/deactivate hospital
4. Appointment slot management or seeded slot view
5. Review moderation only if reviews are implemented

## Design acceptance checklist
- No dead buttons.
- No fake success toasts for actions that were not persisted.
- Every data-driven screen handles loading, empty, error, and success.
- Layout is checked at narrow mobile, tablet, and desktop widths.
- No placeholder lorem ipsum in the final demo.
- Seeded data is realistic but explicitly demo-only.
- No invented ratings, credentials, clinical warnings, or insurance outcomes.
