import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no canvas backend, so getContext("2d") returns null and logs a
// harmless "not implemented" notice. Components that draw (GlyphPreview,
// AtlasPreview) guard on a null context, so their render path no-ops under test.

afterEach(() => {
  cleanup();
});
