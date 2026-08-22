import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { storyProject } from "@/stories/fixtures";
import { NamingControls } from "./naming-controls";

const meta = {
  title: "Editor/NamingControls",
  component: NamingControls,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
  args: { project: storyProject, dispatch: fn(), activeIndex: 0 },
} satisfies Meta<typeof NamingControls>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The live sample under the fields is generated off the real `generateTilesets`,
 * so it shows the Sprite Names the active Device would actually export.
 */
export const SnakeCase: Story = {};

export const KebabCase: Story = {
  args: {
    project: {
      ...storyProject,
      exportSettings: {
        ...storyProject.exportSettings,
        naming: { ...storyProject.exportSettings.naming, case: "kebab" },
      },
    },
  },
};

/** A template using every token, so the sample shows all three substitutions. */
export const AllTokens: Story = {
  args: {
    project: {
      ...storyProject,
      exportSettings: {
        ...storyProject.exportSettings,
        naming: {
          ...storyProject.exportSettings.naming,
          case: "camel",
          template: "{device}_{input}_{index}",
        },
      },
    },
  },
};
