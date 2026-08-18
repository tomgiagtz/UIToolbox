/**
 * Shipped **Presets** — a look you can apply, in two species (ADR-0012 §3/§5).
 *
 * A Preset is style only. It never carries a Device's selection, a project
 * name, or any bytes: a **Device Preset** styles one Device, a **Project
 * Preset** also writes the Project tier of the Style Cascade. Where a covered
 * Device is absent it is created from its Catalog's Default Selection, which is
 * why a Preset's device list says *which* Devices it covers and nothing about
 * what is enabled on them.
 *
 * The shipped set is **code**: authored in the tool, exported to
 * `presets/sources/*.json`, projected into `presets/presets.generated.ts` by
 * `npm run presets`, and checked by `tsc` from then on. Nothing here is parsed
 * at runtime, so ADR-0010's discard-and-report path never applies — a broken
 * Preset is a build defect, not a status line (ADR-0012 §5). This module is the
 * typed accessor over that generated output; the app and tests import here,
 * never the sources or the codegen.
 */
import { PRESETS } from "@/lib/glyph/presets/presets.generated";
import type { GlyphStyle, StyleOverride } from "@/lib/glyph/style";

/**
 * One Device a Preset covers: which Catalog it is for, and the two style tiers
 * that land on it.
 *
 * There is no `enabled` and no `custom` — curating a selection is the most
 * laborious thing in the tool and a Preset must never spend it (ADR-0012 §3).
 * The entry is therefore a **presence** fact plus a look: applying it to a
 * Device you have restyles yours, and to one you lack creates it from that
 * Catalog's Default Selection.
 */
export interface PresetDevice {
  /** The Catalog this entry styles, e.g. "xbox". */
  catalogId: string;
  /** The Device tier of the cascade for this Catalog (sparse; may be `{}`). */
  style: StyleOverride;
  /** The Glyph tier, keyed by Catalog Input id — never a custom id. */
  glyphStyles: Record<string, StyleOverride>;
}

/** What both species carry: identity, picker label, and the Devices covered. */
interface PresetBase {
  /** Stable id, and the key the picker selects by. */
  id: string;
  /** Picker label, e.g. "Neon". The species is said by the action, not a chip. */
  label: string;
  /**
   * Every Device this Preset covers, in manifest order. A Device Preset covers
   * exactly one; a Project Preset may cover any number, including none.
   */
  devices: PresetDevice[];
}

/**
 * A shipped Preset. The two species are one mechanism with a scope, and the
 * scope *is* the discriminant: a Project Preset additionally replaces the
 * Project tier, which is a full {@link GlyphStyle} and so cannot be optional
 * without letting a species claim a tier it doesn't write (ADR-0012 §3).
 */
export type Preset =
  | (PresetBase & { kind: "device" })
  | (PresetBase & { kind: "project"; style: GlyphStyle });

export { PRESETS };

/** The shipped Preset with this id, or `undefined`. */
export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
