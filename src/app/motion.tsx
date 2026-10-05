/**
 * Motion tokens + reduced-motion plumbing.
 *
 * The whole product animates on ONE easing curve and a small set of durations.
 * `useReducedMotion` subscribes to the OS setting live (not just at mount), so
 * toggling "reduce motion" at the OS level takes effect immediately.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";

/** The house curve — expressive ease-out used for every reveal and layout move. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Softer curve for hover-scale and small colour shifts. */
export const EASE_QUART = [0.25, 1, 0.5, 1] as const;

/** Symmetric curve for looping/ambient animation. */
export const EASE_IO = [0.45, 0, 0.55, 1] as const;

export const DURATION = {
  fast: 0.18,
  base: 0.32,
  slow: 0.55,
  reveal: 0.75,
} as const;

/** Resolved transition for an entrance, honouring reduced motion. */
export function revealTransition(reduced: boolean, delay = 0) {
  return reduced
    ? { duration: 0.01 }
    : ({ duration: DURATION.reveal, ease: EASE, delay } as const);
}

type MotionPrefs = {
  /** True when the user or their OS has asked for less motion. */
  reduced: boolean;
  /** Flip this to let a user override the OS preference for the session. */
  setReduced: (value: boolean) => void;
  /** True when the user has explicitly chosen, regardless of OS default. */
  isOverridden: boolean;
  toggle: () => void;
};

const MotionPrefsContext = createContext<MotionPrefs>({
  reduced: false,
  setReduced: () => {},
  isOverridden: false,
  toggle: () => {},
});

export function useMotionPrefs(): MotionPrefs {
  return useContext(MotionPrefsContext);
}

/** Shorthand for the common case: "should I animate?". */
export function useReducedMotion(): boolean {
  return useContext(MotionPrefsContext).reduced;
}

function readSystemPref(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Wraps the app so every motion-aware component reads the same preference.
 *
 * `MotionConfig reducedMotion="user"` additionally makes Motion itself fall
 * back to opacity-only transitions rather than transforms.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [systemReduced, setSystemReduced] = useState(readSystemPref);
  const [override, setOverride] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setSystemReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const reduced = override ?? systemReduced;

  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  }, [reduced]);

  return (
    <MotionPrefsContext.Provider
      value={{
        reduced,
        setReduced: setOverride,
        isOverridden: override !== null,
        toggle: () => setOverride(!reduced),
      }}
    >
      <MotionConfig reducedMotion={reduced ? "always" : "never"}>{children}</MotionConfig>
    </MotionPrefsContext.Provider>
  );
}
