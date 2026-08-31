// The Preset manifest (ADR-0012 §5): what a committed tool export cannot say
// about itself.
//
// An export is an opaque `Project`. It doesn't know its **species**, its picker
// **label**, or — for a Device Preset — which of its Devices is the one being
// shipped. Those three facts live here, beside the file they describe, and
// `build-presets.mts` projects the pair into `presets.generated.ts`.
//
// **Array order is picker order**, as in `symbols/manifest.mjs` and
// `layouts/mapping.mjs`, so re-ordering the cards is one reviewable diff.
//
// The picker is the definition of the set (ADR-0012 §3): a source file no row
// points at is not a Preset, and simply isn't built.

/**
 * @typedef {object} PresetEntry
 * @property {string} id Stable id; the key the picker selects by.
 * @property {string} label Picker label. The species is said by the action
 *   ("Apply to Xbox" / "Apply to Project"), never by a chip, so this is the
 *   look's name and nothing else.
 * @property {"device" | "project"} kind Whether it styles one Device or also
 *   writes the Project tier of the Style Cascade.
 * @property {string} source Filename under `sources/`, committed as exported.
 * @property {string} [catalogId] Device Presets only: which Device to lift out
 *   of the export. Every other Device in that file is dropped.
 */

/** @type {PresetEntry[]} */
export const PRESET_MANIFEST = [
  {
    id: "xbox-brand",
    label: "Brand",
    kind: "device",
    source: "xbox-brand.json",
    catalogId: "xbox",
  },
  { id: "arcade", label: "Arcade", kind: "project", source: "arcade.json" },
];
