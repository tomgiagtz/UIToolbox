import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { storyImages } from "@/stories/fixtures";
import { AssetArt } from "./asset-art";

/**
 * Gallery art, not Glyph art. Shipped drawings are painted in fixed neutral
 * Paint Roles so one tile can be compared against another — the honest answer
 * about how a Glyph will look is the atlas preview, which resolves the real
 * cascade.
 */
const meta = {
  title: "Editor/AssetArt",
  component: AssetArt,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="size-16">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AssetArt>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A cell drawn by the shared atlas, so every Device falls back to it. */
export const SharedSymbol: Story = {
  args: { spec: { kind: "symbol", id: "stick" } },
};

/**
 * The same call with a Device named: `cross` is a PlayStation cell, and the
 * Device is what picks that atlas out of the cascade.
 */
export const DeviceSymbol: Story = {
  args: { spec: { kind: "symbol", id: "cross", device: "playstation" } },
};

/**
 * `bumper` is drawn by no shared atlas at all — only per-device. With no Device
 * to resolve against it still shows art, because a gallery has to say what the
 * tile *is*; the drawing is borrowed from whichever atlas has one.
 */
export const AuthoredBackgroundWithoutDevice: Story = {
  args: { spec: { kind: "authored", id: "bumper" } },
};

/** An uploaded image, drawn from bytes in the runtime registry. */
export const UploadedImage: Story = {
  args: { spec: { kind: "image", id: storyImages[0].id } },
};

/**
 * A config that outlived its assets: no bytes registered, so the dashed
 * placeholder holds the tile's shape rather than collapsing the row.
 */
export const Missing: Story = {
  args: { spec: { kind: "image", id: "never-uploaded.png" } },
};
