/**
 * A page header for every authenticated screen.
 *
 * The dashboard previously had nine different header treatments — a bare
 * `h1`, an `h1` plus a stray uppercase label, an `h1` plus a sentence. This is
 * the single one, so moving between dashboard pages keeps your bearings.
 */
import { type ReactNode } from "react";
import { Display } from "@/app/components/primitives";
import { cn } from "@/app/components/ui/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <Display size="sm">{title}</Display>
        {description && (
          <p className="mt-3 max-w-[var(--measure)] text-[0.9375rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
