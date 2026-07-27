import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no canvas backend, so getContext("2d") returns null and logs a
// harmless "not implemented" notice. Components that draw (GlyphPreview,
// AtlasPreview) guard on a null context, so their render path no-ops under test.

// jsdom implements <dialog> markup but not its methods, so a dialog can never
// leave the closed (and therefore a11y-hidden) state under test. Toggle the
// `open` attribute the methods are specified to toggle; that is all our modals
// — which own their own focus and dismissal — need.
// (guarded: the DOM-free suites run this setup under the Node environment)
if (
  typeof HTMLDialogElement !== "undefined" &&
  !HTMLDialogElement.prototype.showModal
) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

afterEach(() => {
  cleanup();
});
