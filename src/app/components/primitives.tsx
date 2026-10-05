/**
 * The shared surface and typography layer.
 *
 * Every screen in the product composes from these, which is what makes the
 * landing page, the dashboard, and the onboarding funnel read as one design
 * rather than four. Tokens live in `src/styles/theme.css`; nothing here
 * hardcodes a brand colour.
 */
import { forwardRef, type ReactNode } from "react";
import { Link } from "react-router";
import { motion, type HTMLMotionProps } from "motion/react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/app/components/ui/utils";
import { EASE, DURATION, revealTransition, useReducedMotion } from "@/app/motion";

/* ────────────────────────────────────────────────────────────────────────
   Surfaces
   ──────────────────────────────────────────────────────────────────────── */

type Tone = "default" | "strong" | "flat" | "outline" | "brand" | "danger";

const TONE_SURFACE: Record<Tone, string> = {
  /** The default frosted card — `design.md` §2. */
  default: "glass",
  /** For cards that must hold legibility over imagery. */
  strong: "glass-strong",
  /** Opaque sunken panel — no frost, for dense forms and tables. */
  flat: "bg-background-sunken border border-border",
  /** Hairline only, for nested or secondary content. */
  outline: "border border-border bg-transparent",
  /** Orange-tinted — used for exactly one thing per screen: the next action. */
  brand: "bg-warning-surface border border-warning-border",
  /** Red-tinted, for inline error panels. */
  danger: "bg-destructive-surface border border-destructive-border",
};

type SurfaceProps = React.ComponentProps<"div"> & {
  tone?: Tone;
  /** `card` is the standard content radius; `panel` is for large stage areas. */
  radius?: "sm" | "md" | "card" | "panel";
  /** Adds the hover lift. Reserve for surfaces that are themselves clickable. */
  interactive?: boolean;
};

const RADIUS: Record<NonNullable<SurfaceProps["radius"]>, string> = {
  sm: "rounded-lg",
  md: "rounded-xl",
  card: "rounded-card",
  panel: "rounded-panel",
};

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { tone = "default", radius = "card", interactive = false, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        TONE_SURFACE[tone],
        RADIUS[radius],
        interactive && "interactive interactive-lift cursor-pointer",
        className,
      )}
      {...props}
    />
  );
});

/* ────────────────────────────────────────────────────────────────────────
   Typography
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The section label. One treatment everywhere — uppercase mono, brand orange.
 * Previously four sizes and two colours existed across the app.
 */
export function Eyebrow({
  children,
  className,
  as: Tag = "p",
}: {
  children: ReactNode;
  className?: string;
  as?: "p" | "span" | "div";
}) {
  return <Tag className={cn("eyebrow", className)}>{children}</Tag>;
}

/**
 * Page-level display heading. Serif, light weight, tight tracking, optically
 * balanced. `size` is the only knob so a landing hero and a dashboard header
 * can differ without either looking arbitrary.
 */
export function Display({
  children,
  size = "lg",
  className,
  align = "left",
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  align?: "left" | "center";
  className?: string;
}) {
  const scale = {
    sm: "clamp(1.5rem, 2.2vw, 1.875rem)",
    md: "clamp(1.75rem, 2.8vw, 2.375rem)",
    lg: "clamp(2rem, 3.4vw, 2.75rem)",
    xl: "clamp(2.25rem, 4.2vw, 3.5rem)",
    hero: "clamp(2.5rem, 6.4vw, 5rem)",
  }[size];

  return (
    <h1
      className={cn(
        "font-serif font-light tracking-[-0.025em] leading-[1.08] text-balance",
        align === "center" && "text-center",
        className,
      )}
      style={{ fontSize: scale }}
    >
      {children}
    </h1>
  );
}

/** Section heading — the same family as `Display`, one step down. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  size = "md",
  children,
  className,
  headingClassName,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  size?: "sm" | "md" | "lg";
  children?: ReactNode;
  className?: string;
  headingClassName?: string;
}) {
  return (
    <div className={cn(align === "center" && "text-center", className)}>
      {eyebrow && (
        <Reveal delay={0}>
          <Eyebrow className="mb-4">{eyebrow}</Eyebrow>
        </Reveal>
      )}
      <Reveal delay={0.06}>
        <Display size={size} align={align} className={headingClassName}>
          {title}
        </Display>
      </Reveal>
      {description && (
        <Reveal delay={0.12}>
          <p
            className={cn(
              "mt-5 text-[0.9375rem] leading-relaxed text-muted-foreground",
              align === "center" && "mx-auto max-w-2xl",
              !align || align === "left" ? "max-w-[var(--measure)]" : "",
            )}
          >
            {description}
          </p>
        </Reveal>
      )}
      {children}
    </div>
  );
}

/** The orange italic clause inside a serif heading. */
export function Accent({ children }: { children: ReactNode }) {
  return <span className="italic text-brand">{children}</span>;
}

/** Body prose. Opt-in so pages keep control of measure. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("prose-body text-[0.9375rem]", className)}>{children}</div>;
}

/** Technical value — scores, IDs, latencies, key previews. */
export function Telemetry({
  children,
  className,
  as: Tag = "span",
}: {
  children: ReactNode;
  className?: string;
  as?: "span" | "code" | "div" | "p";
}) {
  return <Tag className={cn("telemetry", className)}>{children}</Tag>;
}

/* ────────────────────────────────────────────────────────────────────────
   Motion
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Scroll-triggered entrance. Fires once, on a negative bottom margin so it
 * completes slightly before the element reaches the fold.
 */
export function Reveal({
  children,
  delay = 0,
  y = 20,
  className,
  ...props
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
} & Omit<HTMLMotionProps<"div">, "children">) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 1 } : { opacity: 0, y, filter: "blur(5px)" }}
      whileInView={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-12% 0px -8% 0px" }}
      transition={revealTransition(reduced, delay)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Parent that staggers `RevealItem` children. */
export function RevealGroup({
  children,
  className,
  stagger = 0.07,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10% 0px" }}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: reduced ? 0 : stagger, delayChildren: delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
  y = 18,
  ...props
}: {
  children: ReactNode;
  className?: string;
  y?: number;
} & Omit<HTMLMotionProps<"div">, "children">) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduced ? { opacity: 1 } : { opacity: 0, y },
        visible: {
          opacity: 1,
          y: 0,
          transition: reduced
            ? { duration: 0.01 }
            : { duration: DURATION.base, ease: EASE },
        },
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Buttons
   ──────────────────────────────────────────────────────────────────────── */

type ActionProps = {
  children: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
  variant?: "primary" | "brand" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  trailingArrow?: boolean;
  disabled?: boolean;
  external?: boolean;
  "aria-label"?: string;
};

const ACTION_VARIANT = {
  primary:
    "bg-primary text-primary-foreground shadow-lifted hover:bg-primary-hover hover:shadow-brand",
  brand:
    "bg-brand text-white shadow-brand hover:bg-brand-hover hover:shadow-brand-lg",
  outline:
    "border border-border-strong bg-transparent text-foreground hover:bg-accent hover:border-foreground/20",
  ghost: "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
  danger: "border border-destructive-border bg-destructive-surface text-destructive hover:bg-destructive/10",
} as const;

const ACTION_SIZE = {
  sm: "px-4 py-2 text-[0.8125rem]",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-[0.9375rem]",
} as const;

/**
 * The product's action. One hover grammar — lift, deepen, arrow slide —
 * so every CTA in the app feels like the same control.
 */
export function Action({
  children,
  to,
  href,
  onClick,
  className,
  variant = "primary",
  size = "md",
  trailingArrow = false,
  disabled,
  external,
  ...rest
}: ActionProps) {
  const classes = cn(
    "group inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none",
    "transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
    "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-45",
    ACTION_VARIANT[variant],
    ACTION_SIZE[size],
    className,
  );

  const inner = (
    <>
      {children}
      {trailingArrow && (
        <ArrowRight
         className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1"
          strokeWidth={2}
          aria-hidden
        />
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {inner}
      </Link>
    );
  }

  if (href) {
    const isExternal = external ?? href.startsWith("http");
    return (
      <a
        href={href}
        className={classes}
        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...rest}
      >
        {inner}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classes} {...rest}>
      {inner}
    </button>
  );
}

/** Text link with the same arrow affordance as `Action`. */
export function ActionLink({
  children,
  to,
  href,
  className,
  ...rest
}: {
  children: ReactNode;
  to?: string;
  href?: string;
  className?: string;
  trailingArrow?: boolean;
  onClick?: () => void;
}) {
  const classes = cn(
    "group inline-flex items-center gap-1.5 text-sm text-muted-foreground",
    "transition-colors duration-200 hover:text-foreground",
    className,
  );
  const inner = (
    <>
      {children}
      <ArrowRight
       className="size-3.5 transition-transform duration-200 group-hover:translate-x-1"
        strokeWidth={2}
        aria-hidden
      />
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={href} className={classes} {...rest}>
      {inner}
    </a>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Brand + status
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The wordmark. Previously five separate renderings at four sizes across two
 * typefaces. One size, one typeface, one optical weight.
 */
export function Wordmark({
  className,
  size = "md",
  as: Tag = "span",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  as?: "span" | "div";
}) {
  const scale = { sm: "1.125rem", md: "1.35rem", lg: "1.6rem" }[size];
  return (
    <Tag
      className={cn("font-serif font-medium tracking-tight leading-none", className)}
      style={{ fontSize: scale }}
    >
      Stash Live
    </Tag>
  );
}

/** Small uppercase mono pill. One radius, one scale, for every badge. */
export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-accent text-muted-foreground",
    brand: "bg-warning-surface text-brand-ink",
    success: "bg-success-surface text-success",
    danger: "bg-destructive-surface text-destructive",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "font-mono text-[0.625rem] font-medium uppercase tracking-[0.1em]",
        tones,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Status dot. Always paired with text — never colour alone. */
export function StatusDot({
  tone,
  pulse = false,
  className,
}: {
  tone: "neutral" | "brand" | "success" | "danger";
  pulse?: boolean;
  className?: string;
}) {
  const colors = {
    neutral: "bg-muted-foreground-subtle",
    brand: "bg-brand",
    success: "bg-success",
    danger: "bg-destructive",
  }[tone];
  return (
    <span className={cn("relative flex size-1.5 shrink-0", className)} aria-hidden>
      {pulse && (
        <span
          className={cn("absolute inset-0 rounded-full opacity-60", colors)}
          style={{ animation: "pulse-ring 2s cubic-bezier(0.16,1,0.3,1) infinite" }}
        />
      )}
      <span className={cn("relative size-1.5 rounded-full", colors)} />
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   States
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The empty state. Replaces the seven bespoke "Loading…" paragraphs and the
 * several pages that rendered nothing at all.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Surface tone="outline" className={cn("px-8 py-12 text-center", className)}>
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
        {icon && (
          <div
          className="mb-1 flex size-10 items-center justify-center rounded-full bg-accent text-muted-foreground"
            aria-hidden
          >
            {icon}
          </div>
        )}
        <p className="font-serif text-lg font-normal text-foreground">{title}</p>
        {description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </Surface>
  );
}

/** Loading placeholder that matches the content it stands in for. */
export function SkeletonRows({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Surface key={i} className="p-5">
          <div className="space-y-2.5">
            <div className="h-3 w-1/3 animate-pulse rounded-full bg-accent" />
            <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-accent/70" />
          </div>
        </Surface>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Inline status line — replaces bare coloured `<p>` for success and error. */
export function StatusMessage({
  tone,
  children,
  className,
}: {
  tone: "success" | "danger" | "neutral" | "warning";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    success: "bg-success-surface border-success-border text-success",
    danger: "bg-destructive-surface border-destructive-border text-destructive",
    warning: "bg-warning-surface border-warning-border text-brand-ink",
    neutral: "border border-border bg-accent/50 text-muted-foreground",
  }[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm", tones, className)}
    >
      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current opacity-70" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Ambient background
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The subtle depth layer used behind light content pages — a masked hairline
 * grid plus three very slowly drifting warm blobs. `aria-hidden`; purely
 * decorative; inert when motion is reduced.
 */
const BLOBS = [
  { top: "-12%", left: "8%", size: 520, delay: 0 },
  { top: "18%", left: "62%", size: 420, delay: 7 },
  { top: "64%", left: "38%", size: 480, delay: 14 },
] as const;

export function AmbientBackground({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div
       className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(26,21,18,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(26,21,18,0.045) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 90% 60% at 50% 0%, #000 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 60% at 50% 0%, #000 20%, transparent 75%)",
        }}
      />
      {BLOBS.map((blob) => (
        <motion.div
          key={blob.size}
         className="absolute rounded-full blur-[110px]"
          style={{
            top: blob.top,
            left: blob.left,
            width: blob.size,
            height: blob.size,
            background:
              "radial-gradient(circle, rgba(251,133,0,0.14) 0%, rgba(251,133,0,0.05) 45%, transparent 70%)",
          }}
          animate={
            reduced
              ? undefined
              : { x: [0, 40, -24, 0], y: [0, -28, 22, 0], scale: [1, 1.08, 0.96, 1] }
          }
          transition={{
            duration: 34,
            repeat: Infinity,
            ease: "easeInOut",
            delay: blob.delay,
          }}
        />
      ))}
    </div>
  );
}
