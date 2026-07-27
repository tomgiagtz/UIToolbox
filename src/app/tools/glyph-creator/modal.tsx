"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The editor's modal shell — a native `<dialog>` wrapping a `method="dialog"`
 * form, shared by Save and Export so the two agree on chrome, labelling, and
 * dismissal.
 *
 * The parent opens it (`ref.current.showModal()`); everything that closes it —
 * Esc, the submit, the Cancel button handed to `children` — goes through the
 * dialog itself, so there is no open state to keep in sync.
 */
export function Modal({
  ref,
  title,
  onSubmit,
  className,
  children,
}: {
  ref: React.Ref<HTMLDialogElement>;
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  /** Width/spacing for the form body; the chrome around it is fixed. */
  className?: string;
  /** Rendered inside the form, given a callback that dismisses the modal. */
  children: (close: () => void) => ReactNode;
}) {
  const dialogRef = ref as React.RefObject<HTMLDialogElement | null>;
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto h-fit max-h-[85vh] w-fit rounded-lg border bg-background p-0 text-foreground backdrop:bg-black/40"
    >
      <form
        onSubmit={onSubmit}
        method="dialog"
        className={cn("max-h-[85vh] overflow-y-auto p-5", className)}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children(() => dialogRef.current?.close())}
      </form>
    </dialog>
  );
}
