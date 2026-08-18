"use client";

import { ListBox, ListBoxItem, type Selection } from "react-aria-components";
import type { ReactNode } from "react";
import type { ImageAsset } from "@/lib/glyph/types";
import { cn } from "@/lib/utils";
import { AssetArt } from "./asset-art";

/** One tile: a stable key, the caption under it, and whatever it draws. */
export interface AssetGridItem {
  key: string;
  label: string;
  /** The tile's picture. Text is fine — some tiles have no art to show. */
  art: ReactNode;
}

/**
 * Tile key prefix for an uploaded image.
 *
 * Both pickers encode and decode it, and a Background source and a Render Source
 * that disagreed about the spelling would each silently fall through to their own
 * terminal default — so the pair lives here rather than once per picker.
 */
const IMAGE_KEY = "image:";

/** The tiles for the project's uploaded images, in manifest order. */
export function imageTiles(images: ImageAsset[]): AssetGridItem[] {
  return images.map((image) => ({
    key: `${IMAGE_KEY}${image.id}`,
    label: image.fileName,
    art: <AssetArt spec={{ kind: "image", id: image.id }} />,
  }));
}

/** The tile key naming `id`. */
export function imageKey(id: string): string {
  return `${IMAGE_KEY}${id}`;
}

/** The image id a tile key names, or `null` if the key names something else. */
export function imageIdFromKey(key: string): string | null {
  return key.startsWith(IMAGE_KEY) ? key.slice(IMAGE_KEY.length) : null;
}

/**
 * A single-select grid of picture tiles, replacing the artwork `<select>`s
 * (ADR-0014 §5, #45) so the user picks art they can see.
 *
 * The component itself knows nothing about **Assets**: tiles are handed in
 * already drawn. That is what lets a Background picker put its two non-art
 * choices — `none` and `shape` — at the head of the same grid without the grid
 * needing a notion of "an option that isn't an Asset", so one control still
 * presents every variant of the union as the `<select>` it replaces did. The
 * tile helpers above are the Asset-aware half, kept beside it because both
 * pickers share them.
 *
 * Built on `react-aria-components`' `ListBox` rather than a grid of buttons: a
 * picker is a listbox, and this way arrow-key navigation, typeahead, and the
 * selected/focused announcements come from the library rather than from a
 * hand-rolled keyboard handler that would have to be right on its own.
 */
export function AssetGrid({
  label,
  items,
  selectedKey,
  onSelect,
  className,
}: {
  /** Accessible name — these grids sit inside a Field with a visible label. */
  label: string;
  items: AssetGridItem[];
  /** The currently picked tile, or `null` when the value is not in the grid. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  className?: string;
}) {
  function onSelectionChange(keys: Selection) {
    // "all" is unreachable in single-selection mode, and an empty set means the
    // user re-pressed the selected tile. Neither is a new choice, and treating
    // the empty set as one would clear a property that has no empty value.
    if (keys === "all") return;
    const [first] = [...keys];
    if (typeof first === "string") onSelect(first);
  }

  return (
    <ListBox
      aria-label={label}
      layout="grid"
      selectionMode="single"
      // Re-pressing the selected tile must not deselect it: every property this
      // drives is total, so "nothing selected" is not a value it could take.
      disallowEmptySelection
      selectedKeys={selectedKey === null ? [] : [selectedKey]}
      onSelectionChange={onSelectionChange}
      items={items}
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 rounded-md border border-input bg-surface-base p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {(item) => (
        <ListBoxItem
          id={item.key}
          textValue={item.label}
          className={({ isSelected, isFocusVisible }) =>
            cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-md border p-1.5 outline-none",
              isSelected
                ? "border-ring bg-surface-hover"
                : "border-transparent hover:bg-surface-hover",
              isFocusVisible && "ring-2 ring-ring",
            )
          }
        >
          {/* Descendant, not child: AssetArt wraps shipped art in a span of its
              own, so a child selector reaches the wrapper and never the svg. */}
          <span className="flex size-10 items-center justify-center [&_img]:size-full [&_img]:object-contain [&_svg]:size-full">
            {item.art}
          </span>
          <span className="w-full truncate text-center text-[11px] leading-tight text-muted-foreground">
            {item.label}
          </span>
        </ListBoxItem>
      )}
    </ListBox>
  );
}
