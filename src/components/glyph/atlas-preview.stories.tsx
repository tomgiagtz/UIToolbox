import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { WithGlyphFont, glyphsOf } from "@/stories/fixtures";
import { AtlasPreview } from "./atlas-preview";

const meta = {
  title: "Glyph/AtlasPreview",
  component: AtlasPreview,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <WithGlyphFont>
        <div className="h-96 w-96">
          <Story />
        </div>
      </WithGlyphFont>
    ),
  ],
  args: {
    deviceName: "Keyboard",
    glyphs: glyphsOf(["W", "A", "S", "D", "Space", "Shift"]),
    cellSize: 128,
    className: "h-full w-full object-contain",
  },
} satisfies Meta<typeof AtlasPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The packed atlas, drawn through the same compositor the exporter uses. */
export const Packed: Story = {};

/**
 * With `onSelectGlyph` set the canvas becomes clickable: hovering a cell draws
 * the highlight box, and the cursor turns. Hover it to see the hit-testing —
 * the gutters between cells deliberately don't highlight.
 */
export const Selectable: Story = {
  args: { onSelectGlyph: fn() },
};

/** A Device with no Inputs takes the placeholder branch instead of a canvas. */
export const Empty: Story = {
  args: { glyphs: [] },
};

/** One row, so the packer's grid isn't doing any wrapping. */
export const SingleRow: Story = {
  args: { glyphs: glyphsOf(["A", "B", "C"]) },
};

/** A small cell size, where label auto-shrink has the least room to work with. */
export const SmallCells: Story = {
  args: {
    cellSize: 32,
    glyphs: glyphsOf(["Ctrl", "Alt", "Shift", "Enter"]),
  },
};
