---
name: pago-ui
description: Use whenever creating or changing a UI component, page, dialog, or any styling in web/src. Makes the new UI follow the Pago application theme (design tokens, light/dark, shared components, Romanian text). Do not use for backend or API work.
---

# Pago UI theme

Every new UI element in `web/src` must look like the Pago app and work in both light and dark theme. The source of truth is `web/src/index.css` (tokens) and `.hackathon-pulse/DESIGN.md` (design spec). Read `index.css` before adding a new kind of element.

## 1. Reuse before you build
Check `web/src/components/ui.jsx` first and use what exists: `Card`, `CardTitle`, `PageHeader`, `CategoryIcon`, `StatusBadge`, `Button` (`primary` / `secondary` / `ghost`, `loading` prop), `ProgressBar`, `Loading`, `ErrorBox`, and `useToast` for feedback. Also check `BillRow.jsx` and `modules/provider-map/ProviderLogo.jsx`. Only create a new primitive when none fits, and then put it in `ui.jsx` so others reuse it.

## 2. Colors: tokens only, never raw hex
- Use the semantic Tailwind classes: `bg-ground`, `bg-surface`, `bg-surface-2`, `text-ink`, `text-muted`, `border-line`, `text-accent`, `bg-accent-soft`.
- The `slate-*`, `brand-*`, `red/amber/emerald-*` palettes are remapped to the theme, so they follow light/dark automatically. Use them for text, borders and statuses (for example `bg-emerald-50 text-emerald-700` for success).
- Never write hex or `rgb()` colors in components, and never use `dark:` variants. The theme switches through `<html data-theme>` and the tokens already change.
- Charts and SVG attributes can't use `var()`. Take colors from `THEME_COLORS` / `useTheme().colors` in `lib/theme.jsx`.
- Yellow `#FFD54A` is only for poster/hero accents and highlights, not for general UI.

## 3. Shape and typography
- Cards: `rounded-[18px] border border-line bg-surface shadow-[var(--shadow)]`. In practice, use `<Card>`.
- Buttons and inputs: `rounded-xl`. Pills and badges: `rounded-full`.
- Font is Poppins (already global). Headings: `h1` bold, `h2` semibold, body 15px. Don't set font families.
- Icons come from `lucide-react` only, as line icons, usually `h-4 w-4` or `h-5 w-5`. A category icon sits in a soft rounded square, like `CategoryIcon`.
- Money goes through `ron()`, dates through `format.js`, categories through `category()`. Don't format these by hand.

## 4. Layout
- Mobile first. The app has a desktop sidebar and a mobile bottom nav, so every page has to work on a narrow screen. Use responsive classes (`sm:`, `lg:`) and leave room at the bottom on mobile (`pb-24`).
- A page lives in `pages/` or `modules/<name>/`, uses `PageHeader`, and is registered in `main.jsx` and `components/Layout.jsx`.

## 5. Text and states
- All user-facing text is in Romanian.
- Every data-driven component handles loading (`Loading`), error (`ErrorBox`) and empty states.
- Buttons that trigger requests show `loading`. Results and errors go through `useToast`.
- Keep focus styles and `aria-label`s on icon-only buttons. Respect `prefers-reduced-motion` for any animation.

## 6. Special cases
- The gradient `.ai-btn` is the only AI-styled element (automatic provider detection). Don't copy its gradient or glow into other components.
- For security status in the Gmail import (trusted, suspicious, malicious), use the existing status colors (emerald, amber, red) and always add an icon and a text label, not color alone.

## Before finishing
- Check the component in light and dark theme (the toggle is in the sidebar) and at mobile width.
- Grep your diff for hex colors and `dark:`. There should be none.
