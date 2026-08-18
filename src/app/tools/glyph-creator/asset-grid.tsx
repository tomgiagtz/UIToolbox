"use client";

import { ListBox, ListBoxItem, type Selection } from "react-aria-components";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One tile: a stable key, the caption under it, and whatever it draws. */
export interface AssetGridItem {
  key: string;
  label: string;
  /** The tile's picture. Text is fine — some tiles have no art to show. */
  art: ReactNode;
}

/**
 * A single-select grid of picture tiles, replacing the artwork `<select>`s
 * (ADR-0014 §5, #45) so the user picks art they can see.
 *
 * It knows nothing about **Assets**. Tiles are handed in already drawn, which is
 * what lets a Background picker put its two non-art choices — `none` and
 * `shape` — at the head of the same grid without the grid needing a notion of
 * "an option that isn't an Asset". One control still presents every variant of
 * the union, as the `<select>` it replaces did.
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
        "grid grid-cols-4 gap-2 rounded-md border border-input bg-surface-base p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          <span className="flex size-10 items-center justify-center [&>svg]:size-full [&>img]:size-full [&>img]:object-contain">
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
