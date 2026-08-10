"use client";

import { useId, useState } from "react";
import { normalizeRotation } from "@/lib/glyph/style";
import type { TransformOverride } from "@/lib/glyph/style";
import type { LayerTransform } from "@/lib/glyph/types";
import { ResetButton, inputClass } from "./controls-ui";

/**
 * Rotation is in **degrees**, and free rather than snapped: a Preset export is
 * hand-authorable, and `90` means something there that `1.5708` does not.
 *
 * The range is centred on 0 rather than running 0–360, so turning a layer
 * anticlockwise is half the slider instead of the far end of it. Both extremes
 * are legal and stable — see `normalizeRotation`.
 */
const ROTATION_RANGE = { min: -180, max: 180, step: 1 };

/**
 * Range of the scale sliders. They run past 1 so a layer can be pushed to the
 * cell edge and beyond (the renderer clips to the cell), and symmetrically below
 * zero because a negative component is how you mirror an axis.
 *
 * Zero is on the grid and reachable. It is not a degenerate value needing a
 * guard: the canvas draws nothing through a non-invertible matrix, the number
 * shows in the box beside the slider, and one reset undoes it — and it is the
 * only way to say "draw this layer's art, but not this one".
 */
const SCALE_RANGE = { min: -2, max: 2, step: 0.1 };

/** Round a slider's float to the precision its step implies. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A numeric text box that keeps what the user is typing. Half-typed input ("-",
 * "1.") parses to nothing, so it is held as a draft rather than snapped back to
 * the last committed value mid-keystroke.
 */
function NumberBox({
  id,
  label,
  value,
  step,
  onCommit,
}: {
  id?: string;
  label: string;
  value: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="number"
      aria-label={label}
      step={step}
      className={`${inputClass} w-20 shrink-0`}
      value={draft ?? String(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(parsed))
          onCommit(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** One axis of the scale: a slider and an editable box over the same number. */
function ScaleAxis({
  name,
  value,
  onChange,
}: {
  /** Stable control name, e.g. "Background transform scale X". */
  name: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {`${name} (${value})`}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          min={SCALE_RANGE.min}
          max={SCALE_RANGE.max}
          step={SCALE_RANGE.step}
          value={value}
          onChange={(e) => onChange(round(Number(e.target.value)))}
          className="min-w-0 flex-1"
        />
        <NumberBox
          label={name}
          value={value}
          step={SCALE_RANGE.step}
          onCommit={onChange}
        />
      </div>
    </div>
  );
}

/**
 * Edits one drawing layer's {@link LayerTransform} — the tile's or the
 * foreground's (ADR-0012 §2). Rotation and both scale axes each patch on their
 * own, so a tier that only mirrors doesn't also pin a rotation it never asked
 * about, and each has its own reset because each is its own control.
 *
 * There is deliberately **no flip affordance**: a negative scale is the familiar
 * way to mirror, and a checkbox beside the number that means the same thing is a
 * second control for one value.
 */
export function TransformField({
  label,
  hint,
  transform,
  onChange,
  onResetRotation,
  onResetScale,
}: {
  /** Names the layer, e.g. "Background transform". */
  label: string;
  hint?: string;
  /** The effective transform at the current scope. */
  transform: LayerTransform;
  onChange: (patch: TransformOverride) => void;
  /** Set when this scope overrides the layer's rotation; clears that alone. */
  onResetRotation?: () => void;
  /** Set when this scope overrides the layer's scale; clears both axes. */
  onResetScale?: () => void;
}) {
  const rotationId = useId();
  /**
   * Scaling both axes together is the everyday gesture and per-axis scaling the
   * rare one, so the axes start linked — but only when they agree. A seeded
   * mirror (`x: -1, y: 1`) opens unlinked with the mirror visible, since a linked
   * drag through it would silently un-mirror the control.
   *
   * Panel state, deliberately: it is how this control is being used, not part of
   * the style, so it never persists and never cascades.
   */
  const [linked, setLinked] = useState(transform.scale.x === transform.scale.y);
  const setScale = (value: number, axis: "x" | "y") =>
    onChange({ scale: linked ? { x: value, y: value } : { [axis]: value } });

  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <span>{label}</span>
      </legend>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={rotationId} className="text-xs text-muted-foreground">
          {`Rotation (${Math.round(transform.rotation)}°)`}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={rotationId}
            type="range"
            min={ROTATION_RANGE.min}
            max={ROTATION_RANGE.max}
            step={ROTATION_RANGE.step}
            value={transform.rotation}
            onChange={(e) =>
              onChange({ rotation: normalizeRotation(Number(e.target.value)) })
            }
            className="min-w-0 flex-1"
          />
          <NumberBox
            label={`${label} rotation`}
            value={transform.rotation}
            step={ROTATION_RANGE.step}
            onCommit={(rotation) =>
              onChange({ rotation: normalizeRotation(rotation) })
            }
          />
          {onResetRotation && (
            <ResetButton
              label={`${label} rotation`}
              onReset={onResetRotation}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={linked}
            onChange={(e) => setLinked(e.target.checked)}
            className="size-3.5"
          />
          {`Link ${label.toLowerCase()} scale axes`}
        </label>
        {onResetScale && (
          <ResetButton label={`${label} scale`} onReset={onResetScale} />
        )}
      </div>

      <ScaleAxis
        name={`${label} scale X`}
        value={transform.scale.x}
        onChange={(x) => setScale(x, "x")}
      />
      <ScaleAxis
        name={`${label} scale Y`}
        value={transform.scale.y}
        onChange={(y) => setScale(y, "y")}
      />

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </fieldset>
  );
}
