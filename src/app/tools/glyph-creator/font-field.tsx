"use client";

import { useId } from "react";
import { useFontRegistry } from "@/components/glyph/use-font-registry";
import { isVariableWeight, type WeightAxis } from "@/lib/glyph/font-axes";
import { pickableFonts } from "@/lib/glyph/fonts";
import type { Project } from "@/lib/glyph/types";
import { Field, inputClass } from "./controls-ui";

/** File types the font picker accepts. */
const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2,font/*";

/**
 * Picks the font a scope's labels are drawn in, from the families that ship
 * with the tool plus whatever the project has uploaded, and uploads a new one.
 *
 * It lives in the Style panel's **Foreground** group rather than above the panel
 * because the font cascades like any other property (ADR-0012 §2): the Project
 * tier sets the project's face, and a Device or single Glyph can override it.
 * So this control edits whichever scope is selected, and carries the same reset
 * affordance as the colours beside it.
 */
export function FontField({
  project,
  family,
  weight,
  axis,
  onChange,
  onWeightChange,
  onReset,
  onResetWeight,
  onUpload,
}: {
  project: Project;
  /** The effective family at the current scope. */
  family: string;
  /** The effective weight at the current scope. */
  weight: number;
  /**
   * The weight axis of the resolved family, once its face is registered. Absent
   * while a lazily loaded family is still arriving, or if its bytes are gone.
   */
  axis: WeightAxis | undefined;
  onChange: (family: string) => void;
  onWeightChange: (weight: number) => void;
  onReset?: () => void;
  onResetWeight?: () => void;
  /** Hand an uploaded file to the editor; resolves to its manifest entry. */
  onUpload: (file: File) => Promise<{ family: string }>;
}) {
  // The axis comes from the runtime registry, which fills in as faces register.
  // Subscribing here rather than in the parent keeps the one control that cares
  // about registration the one that re-renders on it.
  useFontRegistry();
  const uploadId = useId();
  const fonts = pickableFonts(project);
  const bundled = fonts.filter((f) => f.bundled);
  const uploaded = fonts.filter((f) => !f.bundled);
  // Only a variable face has weights to choose between. A static one has
  // exactly the weight it was drawn, and asking a browser for another gets
  // synthesised fake bold — so there is no control to offer, not a disabled one.
  const variable = axis !== undefined && isVariableWeight(axis);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Font" onReset={onReset}>
        {(id) => (
          <select
            id={id}
            className={inputClass}
            value={family}
            onChange={(e) => onChange(e.target.value)}
          >
            <optgroup label="Bundled">
              {bundled.map((font) => (
                <option key={font.family} value={font.family}>
                  {font.label}
                </option>
              ))}
            </optgroup>
            {uploaded.length > 0 && (
              <optgroup label="Uploaded">
                {uploaded.map((font) => (
                  <option key={font.family} value={font.family}>
                    {font.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
      </Field>

      {variable && (
        <Field
          label={`Font weight (${weight})`}
          hint="This face is variable, so the weight is a real instance rather than a synthesised bold."
          onReset={onResetWeight}
        >
          {(id) => (
            <input
              id={id}
              type="range"
              min={axis.min}
              max={axis.max}
              // The axis is continuous, but a weight is conventionally read in
              // hundreds and a slider that lands on 437 invites nothing good.
              step={10}
              value={weight}
              onChange={(e) => onWeightChange(Number(e.target.value))}
              className="w-full"
            />
          )}
        </Field>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={uploadId} className="text-sm font-medium">
          Upload a font
        </label>
        <input
          id={uploadId}
          type="file"
          accept={FONT_ACCEPT}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // The upload becomes this scope's font straight away: picking a file
            // and then having to pick its name out of a list would be a step
            // with no decision in it.
            if (file)
              void onUpload(file).then((asset) => onChange(asset.family));
            // Clear the input so re-picking the same file still fires a change.
            e.target.value = "";
          }}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
        />
        <p className="text-xs text-muted-foreground">
          TTF, OTF, WOFF, or WOFF2. Uploads stay in your browser, and become
          this scope&rsquo;s font.
        </p>
      </div>
    </div>
  );
}
