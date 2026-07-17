import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import GlyphCreatorPage from "./page";

const meta = {
  component: GlyphCreatorPage,
  tags: ["ai-generated"],
} satisfies Meta<typeof GlyphCreatorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// The full tool route: breadcrumb back-link, page heading/intro, and the
// embedded GlyphCreator in its initial (no font) state.
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: /input glyph creator/i }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /back to uitoolbox/i }),
    ).toHaveAttribute("href", "/");
  },
};
