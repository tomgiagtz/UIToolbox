"use client";

import { useState } from "react";
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
 * It disarms on a blur and on Esc, so an armed button cannot be left waiting for
 * a press by someone who has forgotten what it was pointed at.
 */
export function ConfirmButton({
  label,
  name = label,
  onConfirm,
  className,
}: {
  /** Resting text on the button. */
  label: string;
  /**
   * The accessible name, where it has to say more than the visible text.
   *
   * A Remove button in a list row reads as "Remove" on screen because the row
   * around it names what would go; a screen reader reaches the button on its
   * own. Repeating the filename in the visible text instead would push a long
   * name through the row.
   */
  name?: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  return (
    <Button
      type="button"
      variant={armed ? "destructive" : "outline"}
      size="sm"
      className={className}
      aria-label={armed ? `Confirm — ${name}` : name}
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
      {armed ? "Confirm" : label}
    </Button>
  );
}
