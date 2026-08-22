import { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "./controls-ui";
import { Modal } from "./modal";

/**
 * The parent owns opening the dialog, so the story ships the trigger too rather
 * than force-opening it from a decorator — the open gesture is part of what
 * there is to look at, and Esc / backdrop dismissal only behaves correctly on a
 * dialog that was opened through `showModal()`.
 */
function ModalHarness({
  title,
  body,
  submitLabel,
}: {
  title: string;
  body: React.ReactNode;
  submitLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button onClick={() => ref.current?.showModal()}>Open {title}</Button>
      <Modal ref={ref} title={title} onSubmit={fn()} className="w-96 space-y-4">
        {(close) => (
          <>
            {body}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">{submitLabel}</Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

const meta = {
  title: "Editor/Modal",
  component: ModalHarness,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof ModalHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Save shape: one field and a confirm. */
export const Save: Story = {
  args: {
    title: "Save project",
    submitLabel: "Save",
    body: (
      <Field label="Project name">
        {(id) => (
          <input
            id={id}
            className={`${inputClass} w-full`}
            defaultValue="my-glyphs"
          />
        )}
      </Field>
    ),
  },
};

/** A tall body, to prove the form scrolls inside the 85vh cap rather than the page. */
export const ScrollingBody: Story = {
  args: {
    title: "Export atlas",
    submitLabel: "Generate",
    body: (
      <div className="space-y-4">
        {Array.from({ length: 14 }, (_, i) => (
          <Field key={i} label={`Setting ${i + 1}`}>
            {(id) => <input id={id} className={`${inputClass} w-full`} />}
          </Field>
        ))}
      </div>
    ),
  },
};
