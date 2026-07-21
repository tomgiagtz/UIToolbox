"use client";

import type { Dispatch } from "react";
import { Button, Tooltip, TooltipTrigger } from "react-aria-components";
import type { ProjectAction } from "@/lib/glyph/project";
import { isOverrideFieldSet } from "@/lib/glyph/style";
import type {
  GlyphStyle,
  StyleField,
  StyleOverride,
  StyleScope,
} from "@/lib/glyph/style";
import type { BackgroundShape, Project } from "@/lib/glyph/types";
import { ColorField, Field, ResetButton, inputClass } from "./controls-ui";

const SHAPES: { value: BackgroundShape; label: string }[] = [
  { value: "rounded-rect", label: "Rounded rect" },
  { value: "square", label: "Square" },
  { value: "circle", label: "Circle" },
  { value: "none", label: "None (label only)" },
];

/** Common power-of-two-friendly cell sizes; also drives output resolution. */
const CELL_SIZES = [32, 48, 64, 96, 128, 192, 256];

/** Stable option value for a {@link StyleScope} in the switcher's `<select>`. */
function scopeValue(scope: StyleScope): string {
  if (scope.tier === "project") return "project";
  if (scope.tier === "device") return `device:${scope.deviceIndex}`;
  // Only one Glyph is ever targetable at a time (the selected one), so a bare
  // sentinel is enough — the switcher resolves it back through `selectedGlyph`.
  return "glyph";
}

/** The Glyph currently targetable by the switcher (selected via a preview cell). */
export interface SelectedGlyph {
  deviceIndex: number;
  glyphId: string;
  label: string;
}

/**
 * Picks which tier of the Style Cascade the controls edit: the Project base,
 * one selected Device, or the Glyph the user picked in the preview. A "?" tooltip
 * explains scope. cellSize + font stay Project-global regardless of scope.
 */
export function StyleScopeSwitcher({
  project,
  scope,
  selectedGlyph,
  onScopeChange,
}: {
  project: Project;
  scope: StyleScope;
  selectedGlyph: SelectedGlyph | null;
  onScopeChange: (scope: StyleScope) => void;
}) {
  function onChange(value: string) {
    if (value === "project") return onScopeChange({ tier: "project" });
    if (value.startsWith("device:")) {
      return onScopeChange({
        tier: "device",
        deviceIndex: Number(value.slice("device:".length)),
      });
    }
    if (value === "glyph" && selectedGlyph) {
      onScopeChange({
        tier: "glyph",
        deviceIndex: selectedGlyph.deviceIndex,
        glyphId: selectedGlyph.glyphId,
      });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor="style-scope" className="text-sm font-medium">
          Editing style for
        </label>
        <TooltipTrigger delay={300}>
          <Button
            aria-label="About style scope"
            className="flex size-5 items-center justify-center rounded-full border border-input text-xs text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            ?
          </Button>
          <Tooltip
            offset={6}
            className="max-w-64 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md"
          >
            Scope sets which layer you edit. Project is the base for every
            Glyph; a Device or a single Glyph overrides only itself. Narrower
            scopes win. Click a cell in the preview to edit that Glyph.
          </Tooltip>
        </TooltipTrigger>
      </div>
      <select
        id="style-scope"
        className={inputClass}
        value={scopeValue(scope)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="project">Project (all Glyphs)</option>
        {project.devices.map((d, i) => (
          <option key={d.catalogId || d.name} value={`device:${i}`}>
            {d.name}
          </option>
        ))}
        {selectedGlyph && (
          <option value="glyph">Glyph: {selectedGlyph.label}</option>
        )}
      </select>
    </div>
  );
}

/**
 * Controls for Glyph appearance, resolved through the Style Cascade (#4, #19).
 * They display the effective `style` at the current `scope` and every edit
 * dispatches a scoped `patch-style`. When a property is overridden at a
 * non-Project scope, a reset control appears next to it that clears just that
 * override (`clear-style`), so it falls back up the cascade.
 */
export function StyleControls({
  project,
  dispatch,
  scope,
  style,
  override,
}: {
  project: Project;
  dispatch: Dispatch<ProjectAction>;
  scope: StyleScope;
  /** Effective style at `scope` (what the controls show). */
  style: GlyphStyle;
  /** Raw sparse override at `scope` (`{}` at Project scope). */
  override: StyleOverride;
}) {
  const bg = style.background;

  /** A reset handler for `field`, or undefined when it isn't overridden here. */
  function resetFor(field: StyleField): (() => void) | undefined {
    if (scope.tier === "project" || !isOverrideFieldSet(override, field))
      return undefined;
    return () => dispatch({ type: "clear-style", scope, field });
  }

  const patch = (styleFields: StyleOverride) =>
    dispatch({ type: "patch-style", scope, patch: styleFields });

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <ColorField
        label="Text color"
        value={style.textColor}
        onChange={(textColor) => patch({ textColor })}
        onReset={resetFor("textColor")}
      />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 flex items-center gap-2 text-sm font-medium">
          <span>Background shape</span>
          {resetFor("shape") && (
            <ResetButton
              label="Background shape"
              onReset={resetFor("shape")!}
            />
          )}
        </legend>
        <div className="flex flex-wrap gap-3">
          {SHAPES.map((s) => (
            <label key={s.value} className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="bg-shape"
                value={s.value}
                checked={bg.shape === s.value}
                onChange={() => patch({ background: { shape: s.value } })}
                className="size-4"
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label="Cell size (px)"
        hint="Output resolution per Glyph — applies to the whole project."
      >
        {(id) => (
          <select
            id={id}
            className={inputClass}
            value={project.cellSize}
            onChange={(e) =>
              dispatch({ type: "set-cell-size", size: Number(e.target.value) })
            }
          >
            {CELL_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}×{n}
              </option>
            ))}
          </select>
        )}
      </Field>

      {bg.shape !== "none" && (
        <ColorField
          label="Background fill"
          value={bg.fill}
          onChange={(fill) => patch({ background: { fill } })}
          onReset={resetFor("fill")}
        />
      )}

      {bg.shape === "rounded-rect" && (
        <Field
          label={`Corner radius (${bg.cornerRadius}px)`}
          onReset={resetFor("cornerRadius")}
        >
          {(id) => (
            <input
              id={id}
              type="range"
              min={0}
              max={64}
              value={bg.cornerRadius}
              onChange={(e) =>
                patch({ background: { cornerRadius: Number(e.target.value) } })
              }
              className="w-full"
            />
          )}
        </Field>
      )}

      {bg.shape !== "none" && (
        <>
          <Field
            label={`Border width (${bg.border.width}px)`}
            onReset={resetFor("borderWidth")}
          >
            {(id) => (
              <input
                id={id}
                type="range"
                min={0}
                max={20}
                value={bg.border.width}
                onChange={(e) =>
                  patch({
                    background: { border: { width: Number(e.target.value) } },
                  })
                }
                className="w-full"
              />
            )}
          </Field>

          <ColorField
            label="Border color"
            value={bg.border.color}
            onChange={(color) => patch({ background: { border: { color } } })}
            onReset={resetFor("borderColor")}
          />
        </>
      )}
    </div>
  );
}
