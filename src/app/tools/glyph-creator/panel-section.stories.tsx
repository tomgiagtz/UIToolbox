import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DisclosureGroup } from "react-aria-components";
import { Field, inputClass } from "./controls-ui";
import { PanelSection } from "./panel-section";

/**
 * A `PanelSection` only makes sense inside a `DisclosureGroup` — that is what
 * owns which sections are open. The group is configured the way the editor's
 * left rail configures it (`glyph-creator.tsx`): several sections may be open
 * at once, and Devices starts expanded.
 */
const meta = {
  title: "Editor/PanelSection",
  component: PanelSection,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-80">
        <DisclosureGroup
          defaultExpandedKeys={["devices"]}
          allowsMultipleExpanded
        >
          <Story />
        </DisclosureGroup>
      </div>
    ),
  ],
  args: {
    id: "devices",
    title: "Devices",
    help: "The Devices this project exports an atlas for. Each carries its own Inputs and its own tier of the Style Cascade.",
    children: (
      <Field label="Device name">
        {(id) => (
          <input id={id} className={inputClass} defaultValue="Keyboard" />
        )}
      </Field>
    ),
  },
} satisfies Meta<typeof PanelSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One section, expanded. Hover the "?" for the help tooltip. */
export const Expanded: Story = {};

export const Collapsed: Story = { args: { id: "style" } };

/** The rail as it actually reads — several sections stacked in one group. */
export const Stack: Story = {
  render: () => (
    <>
      <PanelSection
        id="devices"
        title="Devices"
        help="The Devices this project exports an atlas for."
      >
        <p className="text-sm text-muted-foreground">Device list goes here.</p>
      </PanelSection>
      <PanelSection
        id="style"
        title="Style"
        help="The Style Cascade — Project, Device, and Glyph tiers."
      >
        <p className="text-sm text-muted-foreground">Style controls go here.</p>
      </PanelSection>
      <PanelSection
        id="naming"
        title="Naming"
        help="How Sprite Names and output filenames are built."
      >
        <p className="text-sm text-muted-foreground">
          Naming controls go here.
        </p>
      </PanelSection>
    </>
  ),
};
