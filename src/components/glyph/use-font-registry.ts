"use client";

import { useSyncExternalStore } from "react";
import {
  getFontRegistryVersion,
  subscribeToFontRegistry,
} from "@/lib/glyph/font";

/**
 * Re-render when a font is registered.
 *
 * The weight axis of a family is read from its bytes and kept outside React
 * (see `font.ts`), because the file is its only authority — but a control that
 * offers weights can only appear once the face it describes has arrived, and
 * bundled families beyond the default arrive lazily. Subscribing keeps that a
 * property of the registry rather than something every caller has to remember
 * to bump.
 *
 * Returns nothing: callers read the registry directly afterwards, which keeps
 * one lookup path rather than a snapshot that could disagree with it.
 */
export function useFontRegistry(): void {
  useSyncExternalStore(
    subscribeToFontRegistry,
    getFontRegistryVersion,
    // Server-rendered markup has no registered fonts and no `document.fonts` to
    // read; a constant keeps the snapshot stable so hydration doesn't loop.
    () => 0,
  );
}
