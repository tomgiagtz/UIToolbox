"use client";

import { useId, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

/** Shared Tailwind for text/number/select controls in the editor panels. */
export const inputClass =
  "h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * A circle-arrow button that clears a scoped override so the property falls back
 * up the Style Cascade. Rendered next to a control only when that property is
 * overridden at the current scope (the parent decides), so its presence doubles
 * as the "this is overridden here" cue.
 */
export function ResetButton({
  label,
  onReset,
}: {
  /** Field name, for the accessible label (e.g. "Background fill"). */
  label: string;
  onReset: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onReset}
      aria-label={`Reset ${label} to inherited`}
      title="Reset to inherited"
      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RotateCcw aria-hidden className="size-4" />
    </button>
  );
}

/** A labeled control. The label is wired to the control via a generated id. */
export function Field({
  label,
  children,
  hint,
  onReset,
}: {
  label: string;
  hint?: string;
  /** When set, an overridden-at-this-scope reset button sits to the right. */
  onReset?: () => void;
  /** Receives the id to attach to the underlying control. */
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children(id)}</div>
        {onReset ? <ResetButton label={label} onReset={onReset} /> : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A labeled color picker with a small hex readout beside the swatch. */
export function ColorField({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** When set, an overridden-at-this-scope reset button sits to the right. */
  onReset?: () => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background"
        />
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
        {onReset ? (
          <div className="ml-auto">
            <ResetButton label={label} onReset={onReset} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
