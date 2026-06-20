# MASTER UI/UX DESIGN & CODE-GENERATION PROMPT

**Role:** Elite UI/UX Principal Designer & Senior Frontend Architect  
**Project:** Premium Light-Mode Web Ecosystem for Stash Live (The Ambient Presenter Suite)  
**Design Paradigm:** High-End Editorial Clean-Tech (Inspired by Claura, Linear, Vercel, and Stripe)  

---

## 1. Design System Tokens & Aesthetic Philosophy

[cite_start]Execute a comprehensive, light-mode system layout that balances crisp technical precision with an organic, human-centric visual narrative[cite: 208]. [cite_start]This system completely steps away from dark-mode conventions, using an intentional, open-space layout that emphasizes elegant typography and clear structure[cite: 207, 208].

### Color Palette Matrix
* [cite_start]**Canvas Base Background:** Warm Alabaster / Antique Cream (`#FBF9F6`)[cite: 209].
* [cite_start]**Primary Type & Interactive Solids:** Deep Espresso / Roasted Charcoal (`#1A1512`)[cite: 209].
* **Secondary Contextual Type:** Muted Earth Slate (`#5A5550`).
* [cite_start]**Product Layer Container Base:** Semi-transparent Frosted Ivory Glass[cite: 209].
* [cite_start]**Visual Accent Pop:** Pale Mint (`#10B981`) for active system states, metrics, and confirmations[cite: 171].

### Functional Typography Layout
* [cite_start]**Display Headings:** High-end, classic editorial serif font (e.g., *Garamond*, *Editorial New*, or a custom display serif) set to tight letter-spacing (`tracking-tight`) to establish a premium, cinematic tone[cite: 210].
* [cite_start]**System Telemetry, Logs & Small Body Copy:** Linear geometric sans-serif (e.g., *Geist*, *Inter*, or *JetBrains Mono* for code variables) prioritizing maximum scannability and structural clarity[cite: 173, 211].

### Light-Mode Glassmorphism Specification
When rendering product data components, apply the following light-glass token parameters:
```css
background: rgba(255, 255, 255, 0.45);
backdrop-filter: blur(20px) saturate(120%);
border: 1px solid rgba(26, 21, 18, 0.06);
box-shadow: 0 8px 32px 0 rgba(26, 21, 18, 0.03);
2. End-to-End Layout Architecture & Page Framework
2.1 The Global 3-Column Navigation Header
Construct an open-air header structured as a precise 3-column split system:


Left Column Group: Low-profile, lowercase geometric text links spaced evenly: about, features, integrations.


Center Anchor: The core "Stash Live" display logotype, centered perfectly along the vertical axis.


Right Column Action: A crisp, high-contrast primary CTA pill button labeled Download Client or Book Live Demo using the deep espresso (#1A1512) background with warm cream text.

2.2 Full-Screen Immersive Hero Section
Transform the entire viewport area (100vh and 100vw) into a high-end, edge-to-edge interactive canvas using the provided digital-grass matrix background image (HLKJ3SzbkAAfbgT.jpg).

Layout & Visual Composition:

Background Implementation: Scale HLKJ3SzbkAAfbgT.jpg cleanly to fill the screen background using background-size: cover; background-position: center;. The image places a person in light clothing centered in an open field, beneath a sky subtly integrated with a digital data overlay.


Asymmetric Typography Split: Position the typography to balance cleanly across the left and right margins, leaving the central standing figure unobstructed.

Left Wing Composition (Left side of the person): Render the core headline in a large, elegant display serif font:


"From presentation friction to pure presence." 


Right Wing Composition (Right side of the person): Place a block of minimalist sans-serif copy explaining the real-time local voice processing engine. Below this text, embed an elegant interactive text input box styled in frosted glass. When keywords are typed, it simulates how the engine displays matching visual assets live on screen.

+-----------------------------------------------------------------------+
|  [about] [features]                 Stash Live           [Download]   |
+-----------------------------------------------------------------------+
|                                                                       |
|   Elegant Serif Heading                                Minimalist Copy|
|  "From presentation                                    & Frosted Glass|
|   friction to pure          ( Central Standing )        Interactive   |
|   presence."                      Person                Input Field   |
|                                                                       |
|                                                                       |
+-----------------------------------------------------------------------+
2.3 The Mid-Page Corporate Value Section
Directly below the fold, design a balanced split-screen layout that pairs high-value messaging with a clean, monochromatic visual asset.

Left Column: The Genuine Value Matrix
Display structured copy analyzing the real-time engagement gap found in virtual meetings.

Explain the functional value: Stash Live automatically projects clean, context-aware data cards directly next to a presenter's shoulder. This allows users to retain direct eye contact, maintain natural human connection, and eliminate the awkward disruptions caused by traditional desktop screen sharing.

Right Column: Monochromatic Abstract Core

Image Implementation: Embed the rich texture from orange.jpg on the right side, styled with an intentional black-and-white filter (filter: grayscale(100%) contrast(110%);) to match the editorial light aesthetic.


UI Overlay: Layer a clean, light-mode glassmorphic data chart component directly over the black-and-white background. Use thin vector lines and sharp typography to illustrate exactly how clean and readable corporate metrics look when rendered by the app.

2.4 The Premium Structural Footer (Screenshot-Inspired)
Model the footer closely after the clean layout framework of premium design patterns, scaling it across the full width of the warm cream canvas to create a balanced layout loop.

              ★ ★ ★ ★ ★ Helped over 100+ businesses
              
     [about] [case studies]        Stash Live         [Book a free call]
  ========================================================================
   Product            Company            Resources          Status
   -- features        -- team            -- docs            -- [●] operational
   -- integrations    -- privacy         -- changelog       -- v1.4.2 local
Component Specifications:
Social Proof Accent Block: Centered prominently at the top of the footer container, render five micro-stars followed by a clean, lowercase subtitle layout:


★ ★ ★ ★ ★ Helped over 100+ businesses scale live engagement.


Top Navigation Row: Replicate the 3-column navigation setup used in the main header: internal navigation groups on the left, centered branding mark, and a deep espresso pill button on the right.


Bottom Details Grid: Separated by a thin, low-contrast 1px horizontal border line, expand the layout into a multi-column resource directory. Include columns for detailed company documentation, developer api resources, legal privacy policies, and a live localized system network status tracker showing [●] System Operational (On-Device Client Active).

3. Interaction Mechanics & Motion Choreography
To ensure a smooth and responsive user experience, implement the following micro-interaction patterns:


The Predictive Slide: When sample triggers are activated in the hero input field, the glassmorphic data cards should transition onto the screen using a fluid, spring-based motion curve (stiffness: 120, damping: 20), avoiding harsh flashes or abrupt layout shifts.


Motion Comfort Configuration Toggle: Include a functional accessibility switch within the footer menu. When toggled on, it disables fluid movement loops and replaces slide animations with clean, instant opacity transitions to protect users sensitive to motion.


Optimized Assets: Process all background image layers and text overlays using lazy-loaded, modern web format wrappers to maximize rendering performance and ensure stable loading speeds across both desktop and mobile viewports.