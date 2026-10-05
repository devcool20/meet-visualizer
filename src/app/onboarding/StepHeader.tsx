/**
 * The shared onboarding page header: eyebrow, display heading, one sentence.
 *
 * All five setup steps previously declared their own `clamp()` size and weight
 * inline — four at `1.6rem/300`, one at `1.8rem/400` — so the heading visibly
 * jumped between consecutive steps.
 */
import { Display } from "@/app/components/primitives";
import { cn } from "@/app/components/ui/utils";

export function StepHeader({
  step,
  title,
  description,
  className,
}: {
  step: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("text-center", className)}>
      <p className="eyebrow mb-4">{step}</p>
      <Display size="sm" align="center">
        {title}
      </Display>
      {description && (
        <p className="mx-auto mt-4 max-w-[46ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

/** The standard footer: optional skip on the left, primary action on the right. */
export function StepActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("mt-8 flex flex-wrap items-center justify-center gap-3", className)}>{children}</div>;
}
