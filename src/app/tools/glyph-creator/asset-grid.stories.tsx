import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { storyImages } from "@/stories/fixtures";
import { AssetArt } from "./asset-art";
import {
  AssetGrid,
  type AssetGridItem,
  imageKey,
  imageTiles,
} from "./asset-grid";

/** Shipped Symbols, drawn the way a Render Source picker heads its grid. */
const symbolTiles: AssetGridItem[] = [
  { key: "symbol:a", label: "A" },
  { key: "symbol:stick", label: "Stick" },
  { key: "symbol:dpad-up", label: "D-pad up" },
  { key: "symbol:key-space", label: "Space" },
].map(({ key, label }) => ({
  key,
  label,
  art: <AssetArt spec={{ kind: "symbol", id: key.slice("symbol:".length) }} />,
}));

/**
 * The grid is controlled, so the harness holds the selection the way a picker's
 * dispatch would. `onSelect` still reports to the Actions panel.
 */
function AssetGridHarness({
  initialKey,
  onSelect,
  ...props
}: Omit<React.ComponentProps<typeof AssetGrid>, "selectedKey"> & {
  initialKey: string | null;
}) {
  const [selectedKey, setSelectedKey] = useState(initialKey);
  return (
    <AssetGrid
      {...props}
      selectedKey={selectedKey}
      onSelect={(key) => {
        setSelectedKey(key);
        onSelect(key);
      }}
    />
  );
}

const meta = {
  title: "Editor/AssetGrid",
  component: AssetGridHarness,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
  args: {
    label: "Render Source",
    items: symbolTiles,
    initialKey: "symbol:stick",
    onSelect: fn(),
  },
} satisfies Meta<typeof AssetGridHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Arrow keys walk the grid and typeahead jumps by caption — both come from
 * `ListBox` rather than a hand-rolled key handler. Re-pressing the lit tile does
 * not clear it: every property this drives is total.
 */
export const Symbols: Story = {};

/**
 * With `onAdd`, a dashed trailing tile joins the grid as an option, so arrowing
 * past the last upload lands on it and Enter opens the Assets window. It is
 * never lit — it is a way out of the grid, not a value the grid can hold.
 */
export const WithAddTile: Story = {
  args: { onAdd: fn() },
};

/**
 * The project's uploads, keyed through `imageTiles` so the Background and Render
 * Source pickers cannot disagree about the spelling.
 */
export const Uploads: Story = {
  args: {
    label: "Background tile",
    items: imageTiles(storyImages),
    initialKey: imageKey(storyImages[0].id),
    onAdd: fn(),
  },
};

/**
 * The stored value is not among the tiles — a picker passes `null` rather than
 * inventing a selection, and with `onAdd` set the way out is still reachable.
 */
export const NothingSelected: Story = {
  args: { initialKey: null, onAdd: fn() },
};

/** No uploads yet: the add tile is the only thing in the grid. */
export const Empty: Story = {
  args: { items: [], initialKey: null, onAdd: fn() },
};
