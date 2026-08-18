/**
 * Where a **custom image** is referenced from (ADR-0014 §6, issue #62).
 *
 * An image id can be named by two different fields — a Glyph's Render Source
 * (`foreground.renderSource`) and a Background's tile (`background.source`) —
 * and both are ordinary Style Cascade properties, so either can sit at any tier.
 * Removing an image has to find every one of them, because clearing the
 * reference is what stops a later upload inheriting a Glyph that still points at
 * the freed id.
 *
 * The set of sites is **closed**, not a best effort:
 *
 * - the Project base's `background.source` (the base is a full `GlyphStyle`, so
 *   it always carries a source, and it has no `renderSource` to carry);
 * - each Device's sparse override, both fields;
 * - each Glyph override, both fields.
 *
 * Nothing else can hold one. ADR-0006's Catalog per-Input tier is gone (ADR-0012
 * §2), a Catalog **seed** may name only an Authored Background, and a shipped
 * **Preset** is rejected at build time if it carries an `imageId` anywhere.
 *
 * This walks *stored* overrides rather than resolved styles, and deliberately
 * over-counts the same way `familiesInUse` does: a reference on a Glyph whose
 * Input is currently disabled still counts. Over-counting only ever declines to
 * remove something; under-counting silently repoints art.
 */
import type { StyleOverride, StyleScope } from "@/lib/glyph/style";
import type { ImageAsset, Project } from "@/lib/glyph/types";

/** One place an image id is named, precise enough to clear it again. */
export interface ImageReference {
  scope: StyleScope;
  /**
   * Which field named it — also the {@link StyleField} that clears it, so a
   * caller never has to map one to the other.
   */
  field: "backgroundSource" | "renderSource";
}

/**
 * Every scope naming each image id, keyed by id. Ids with no references are
 * absent rather than present-and-empty, so `has` answers "is this used?".
 *
 * One walk rather than a per-image search: removal needs the scopes for one id
 * and the window needs a used/unused answer for every row, and both come off the
 * same pass.
 */
export function imageReferences(
  project: Project,
): Map<string, ImageReference[]> {
  const refs = new Map<string, ImageReference[]>();

  function add(
    imageId: string,
    scope: StyleScope,
    field: ImageReference["field"],
  ) {
    const list = refs.get(imageId);
    if (list) list.push({ scope, field });
    else refs.set(imageId, [{ scope, field }]);
  }

  function walkOverride(override: StyleOverride, scope: StyleScope) {
    const source = override.background?.source;
    if (source?.kind === "image")
      add(source.imageId, scope, "backgroundSource");
    const renderSource = override.foreground?.renderSource;
    if (renderSource?.kind === "image") {
      add(renderSource.imageId, scope, "renderSource");
    }
  }

  const base = project.style.background.source;
  if (base.kind === "image") {
    add(base.imageId, { tier: "project" }, "backgroundSource");
  }

  project.devices.forEach((device, deviceIndex) => {
    walkOverride(device.style, { tier: "device", deviceIndex });
    for (const [glyphId, override] of Object.entries(device.glyphStyles)) {
      walkOverride(override, { tier: "glyph", deviceIndex, glyphId });
    }
  });

  return refs;
}

/**
 * The manifest rows nothing references — exactly what a sweep may drop.
 *
 * Derived from the **manifest** rather than from the references, so a reference
 * to an id the manifest doesn't carry can't conjure a row to delete. Such a
 * reference is already inert: `resolveRenderSource` resolves an image only if the
 * manifest lists it.
 */
export function unusedImages(project: Project): ImageAsset[] {
  const used = imageReferences(project);
  return project.images.filter((image) => !used.has(image.id));
}
