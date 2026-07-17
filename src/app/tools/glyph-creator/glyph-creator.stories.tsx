import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { GlyphCreator } from "./glyph-creator";

const meta = {
  component: GlyphCreator,
  tags: ["ai-generated"],
} satisfies Meta<typeof GlyphCreator>;

export default meta;
type Story = StoryObj<typeof meta>;

// Initial state: no font uploaded yet, so the preview grid is replaced by an
// empty-state prompt and "Generate" is disabled until a font is loaded.
export const Idle: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /generate/i }),
    ).toBeDisabled();
    await expect(
      canvas.getByText(/upload a font to see a live preview/i),
    ).toBeVisible();
  },
};

// Proves the app's Tailwind stylesheet actually loaded in the preview: the
// disabled "Generate" button gets `disabled:opacity-50` from buttonVariants,
// which resolves to opacity 0.5 only if Tailwind's utilities are present.
export const CssCheck: Story = {
  play: async ({ canvas }) => {
    const generate = canvas.getByRole("button", { name: /generate/i });
    await expect(getComputedStyle(generate).opacity).toBe("0.5");
  },
};
