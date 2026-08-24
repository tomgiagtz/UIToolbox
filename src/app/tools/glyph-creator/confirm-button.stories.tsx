import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { ConfirmButton } from "./confirm-button";

/**
 * The two presses are the whole component, and neither is visible in a static
 * frame — press once to arm it, then blur it or hit Esc to watch it disarm. The
 * `onConfirm` spy only fires on the second press, which the Actions panel shows.
 */
const meta = {
  title: "Editor/ConfirmButton",
  component: ConfirmButton,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { label: "Remove", onConfirm: fn() },
} satisfies Meta<typeof ConfirmButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A row's Remove button: the row around it names what would go. */
export const Default: Story = {};

/**
 * The same button reached on its own by a screen reader, where "Remove" does not
 * say enough — `name` carries the filename that the visible text leaves to the
 * row.
 */
export const NamedForScreenReaders: Story = {
  args: { label: "Remove", name: "Remove metal.png" },
};

/** The sweep at the top of the Images section, which counts what it would take. */
export const Sweep: Story = {
  args: { label: "Remove unused (3)" },
};
