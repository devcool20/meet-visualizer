# Design System Specification (`design.md`)
**Project:** Stash Live Design Ecosystem (The Ambient Presenter Suite)
[cite_start]**Theme Framework:** Premium Editorial Light Mode [cite: 207, 208]
[cite_start]**Inspirational DNA:** Vercel, Linear, and modern clean-tech Twitter grid architectures [cite: 118, 170]

---

## 1. Core Visual Tokens

[cite_start]The user interface rejects the heavy dark-mode conventions of early AI tools, opting instead for a highly polished, editorial light-mode canvas that emphasizes whitespace, fine rules, and high-contrast component nesting[cite: 208].

### 1.1 Palette Matrix
* [cite_start]**Canvas Base Background:** `#FBF9F6` (Warm Alabaster / Antique Cream)[cite: 209].
* [cite_start]**Primary Text & Solids:** `#1A1512` (Deep Espresso / Carbon Charcoal)[cite: 209].
* [cite_start]**Overlay Glass Containers:** Semi-transparent Frosted Ivory Glass.
* [cite_start]**System Success Accent:** `#fb8500` (Orange for telemetry and active logs)[cite: 171].

### 1.2 Typography Spectrum
* [cite_start]**Display & Key Sections:** High-end display serif font (e.g., *Editorial New*, *Garamond*) with tight letter-spacing to establish a premium tone[cite: 210].
* [cite_start]**Interface & Technical Telemetry:** Razor-sharp geometric sans-serif (e.g., *Geist*, *Inter*) paired with *JetBrains Mono* for system logs[cite: 126, 172, 173].

---

## 2. The Glassmorphism Specification

[cite_start]To guarantee total legibility against chaotic real-world video backgrounds and maintain compression clarity, our custom glass containers utilize a precise high-luminance alpha mix[cite: 281, 282, 300].

```css
.stash-glass-card {
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(20px) saturate(120%);
  border: 1px solid rgba(26, 21, 18, 0.06);
  box-shadow: 0 8px 32px 0 rgba(26, 21, 18, 0.03);
}

Aesthetic Note: Every overlay block includes an ultra-thin 1px high-contrast gradient outline. This faint border acts as a light-catcher, preserving the visual container shape regardless of background variations.

3. Component Architecture
3.1 Global 3-Column Navigation Navbar
Built as an open-air structural header distributed cleanly across three explicit layout grids to avoid any text overlapping:


Left Axis Block: Minimalist, lowercase navigation paths utilizing a generous flex gap layout (flex items-center gap-8): about, features, integrations.


Center Baseline Anchor: The centered "Stash Live" branding typography mark.


Right Axis Action: A low-profile link text Download Client followed closely by a high-contrast, rounded primary CTA pill button (Book Live Demo) styled in Deep Espresso (#1A1512).

+---------------------------------------------------------------------------------------+
|  [about] [features] [integrations]          Stash Live          Download  [Book Demo] |
+---------------------------------------------------------------------------------------+
3.2 Premium Interactive Cards (The Presenter Overlays)
These layout blocks handle the presentation data charts and context sheets, materializing adjacent to the user's shoulder area.


Card Base Geometry: Soft, elegantly rounded rect profiles with high-luminance frosted-glass parameters.


Inner Component Styling: * Micro-typography components styled via mathematical Vector/SDF fields to eliminate compression blurring.

Crisp, minimalist monochrome bar charts, metrics, or trust credentials that slowly animate into focus to avoid jarring flashes.


Interaction State: Micro-gestures act as active controller triggers—flicking a hand dismisses the card out of the screen layout with a spring-based motion curve.

+---------------------------------------+
|  ✔ DATA COMPLIANCE MODULE             | <--- Thin Light-Catching Border Gradient [cite: 28, 300]
|  ===================================  |
|  • Localized Encryption Architecture  | <--- Monospaced System Typography [cite: 126]
|  • Active Node Syncing                |
|  [ 94% Retention Boost ]              | <--- Orange Accent Highlight [cite: 171]
+---------------------------------------+
4. Modern Trend Additions & Guardrails

Micro-Grids: Take inspiration from current clean-tech web patterns by separating major dashboard zones with fine, low-opacity 1px layout border dividers.


Motion Comfort Configuration: Include a clean, custom accessibility slider widget in the base layout footer. When checked, it immediately shifts the display from fluid spring-based animations to clean, instant opacity transitions.