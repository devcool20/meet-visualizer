import { useEffect, useMemo, useRef, useState } from "react";
import { GlassCard, createDomTextMeasurer } from "@stash/card-react";
import { CARD, layoutCard } from "@stash/card-core";
import type { CardSpec } from "@stash/card-spec";

/** Reserve the card's painted dimensions, not its unscaled layout box. */
export function FittedCard({
  spec,
  reduced,
  maxWidth = 330,
  fitHeight = false,
}: {
  spec: CardSpec;
  reduced: boolean;
  maxWidth?: number;
  fitHeight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => {
      if (alive) setFontsReady(true);
    });
    const observer = new ResizeObserver(([entry]) =>
      setBounds({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, []);
  const height = useMemo(
    () => layoutCard(spec, createDomTextMeasurer()).height,
    [spec, fontsReady],
  );
  const width = Math.max(
    0,
    Math.min(
      maxWidth,
      bounds.width,
      fitHeight ? (bounds.height * CARD.width) / height : Infinity,
    ),
  );
  return (
    <div
      ref={ref}
      className={`flex w-full items-center justify-center ${fitHeight ? "h-full" : ""}`}
    >
      {width > 0 && (
        <div
          style={{
            width,
            height: (height * width) / CARD.width,
            flexShrink: 0,
          }}
        >
          <GlassCard spec={spec} width={width} reducedMotion={reduced} />
        </div>
      )}
    </div>
  );
}
