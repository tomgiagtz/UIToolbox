"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * A destructive button that arms on the first press and acts on the second
 * (ADR-0014 §5).
 *
 * Inline rather than a modal because removing an Asset is a small, frequent,
 * local action: a dialog for each one would train the user to dismiss dialogs
 * without reading them, and the one dialog in this editor that must be read is
 * the missing-assets modal (#81).
 *
 * It disarms on a blur or an Esc, and after a timeout, so an armed button left
 * on screen can never be pressed later by someone who has forgotten what it was
 * pointed at.
 */
export function ConfirmButton({
  label,
  confirmLabel = "Confirm",
  onConfirm,
  className,
}: {
  /** Resting text, and the accessible name of the action being confirmed. */
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed]);

  return (
    <Button
      type="button"
      variant={armed ? "destructive" : "outline"}
      size="sm"
      className={className}
      aria-label={armed ? `${confirmLabel} — ${label}` : label}
      onBlur={() => setArmed(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && armed) {
          // Stop here: the same Esc would otherwise close the whole window,
          // which is not what disarming a button should do.
          e.stopPropagation();
          setArmed(false);
        }
      }}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}
