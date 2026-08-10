"use client";

import { useId, useState } from "react";
import type { TransformOverride } from "@/lib/glyph/style";
import type { Transform } from "@/lib/glyph/types";
import { ResetButton, inputClass } from "./controls-ui";

/**
 * Rotation is in **degrees**, and free rather than snapped: a Preset export is
 * hand-authorable, and `90` means something there that `1.5708` does not.
 *
 * The slider stops one step short of a full turn, because 360° normalises to 0
 * and the thumb would spring back from the end it was just dragged to.
 */
const ROTATION_RANGE = { min: 0, max: 359, step: 1 };

/**
 * Range of the scale sliders. They run past 1 so a layer can be pushed to the
 * cell edge and beyond (the renderer clips to the cell), and symmetrically below
 * zero because a negative component is how you mirror an axis.
 */
const SCALE_RANGE = { min: -2, max: 2, step: 0.1 };

/**
 * Move a scale slider to `next`, stepping **over** zero — from −0.1 straight to
 * 0.1. A layer scaled to nothing is an empty cell you can't see to drag back out
 * of, so the slider skips the degenerate value; the numeric box beside it still
 * accepts it, since a user who types `0` means it.
 */
function stepOverZero(next: number, current: number): number {
  if (next !== 0) return next;
  return current < 0 ? SCALE_RANGE.step : -SCALE_RANGE.step;
}

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
          onChange={(e) =>
            onChange(round(stepOverZero(Number(e.target.value), value)))
          }
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
 * Edits one drawing layer's {@link Transform} — the tile's or the content's
 * (ADR-0012 §2). Rotation and both scale axes each patch on their own, so a tier
 * that only mirrors doesn't also pin a rotation it never asked about.
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
  onReset,
}: {
  /** Names the layer, e.g. "Background transform". */
  label: string;
  hint?: string;
  /** The effective transform at the current scope. */
  transform: Transform;
  onChange: (patch: TransformOverride) => void;
  /**
   * When set, a reset button clears the **whole layer's** transform — one entry
   * per layer, so rotation and scale fall back up together.
   */
  onReset?: () => void;
}) {
  const rotationId = useId();
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <span>{label}</span>
        {onReset && <ResetButton label={label} onReset={onReset} />}
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
            onChange={(e) => onChange({ rotation: Number(e.target.value) })}
            className="min-w-0 flex-1"
          />
          <NumberBox
            label={`${label} rotation`}
            value={transform.rotation}
            step={ROTATION_RANGE.step}
            onCommit={(rotation) => onChange({ rotation })}
          />
        </div>
      </div>

      <ScaleAxis
        name={`${label} scale X`}
        value={transform.scale.x}
        onChange={(x) => onChange({ scale: { x } })}
      />
      <ScaleAxis
        name={`${label} scale Y`}
        value={transform.scale.y}
        onChange={(y) => onChange({ scale: { y } })}
      />

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </fieldset>
  );
}
