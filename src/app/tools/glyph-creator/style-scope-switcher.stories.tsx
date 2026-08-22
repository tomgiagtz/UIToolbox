import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { storyProject } from "@/stories/fixtures";
import { StyleScopeSwitcher } from "./style-controls";

/** A Glyph the user has picked out of the preview, making the Glyph tier reachable. */
const selectedGlyph = {
  deviceIndex: 0,
  glyphId: storyProject.devices[0].enabled[0],
  label: "Space",
};

const meta = {
  title: "Editor/StyleScopeSwitcher",
  component: StyleScopeSwitcher,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
  args: {
    project: storyProject,
    scope: { tier: "project" },
    selectedGlyph: null,
    onScopeChange: fn(),
  },
} satisfies Meta<typeof StyleScopeSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The base of the cascade. */
export const ProjectTier: Story = {};

export const DeviceTier: Story = {
  args: { scope: { tier: "device", deviceIndex: 0 } },
};

/**
 * The Glyph option only exists once a Glyph is selected — with `selectedGlyph`
 * null the tier is unreachable, which is what the other two stories show.
 */
export const GlyphTier: Story = {
  args: {
    selectedGlyph,
    scope: {
      tier: "glyph",
      deviceIndex: 0,
      glyphId: selectedGlyph.glyphId,
    },
  },
};
