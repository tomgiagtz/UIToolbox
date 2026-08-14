"use client";

import type { ReactNode } from "react";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  Heading,
  Tooltip,
  TooltipTrigger,
} from "react-aria-components";
import { ChevronRight } from "lucide-react";

interface PanelSectionProps {
  /** Stable key for the enclosing DisclosureGroup. */
  id: string;
  title: string;
  /** Copy shown in the "?" tooltip describing what the section does. */
  help: string;
  children: ReactNode;
}

/**
 * One collapsible section of the editor's left panel: a react-aria
 * {@link Disclosure} whose header carries the section title trigger plus a "?"
 * help affordance ({@link TooltipTrigger}). Meant to sit inside a
 * `DisclosureGroup`, which governs which single section is open.
 */
export function PanelSection({ id, title, help, children }: PanelSectionProps) {
  return (
    <Disclosure id={id} className="border-b">
      <Heading className="flex items-center">
        <Button
          slot="trigger"
          className="group flex flex-1 items-center gap-2 py-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-container-duration) ease-(--motion-container-easing) group-aria-expanded:rotate-90"
          />
          {title}
        </Button>
        <TooltipTrigger delay={300}>
          <Button
            aria-label={`About ${title}`}
            className="flex size-6 items-center justify-center rounded-full border border-input text-xs text-muted-foreground outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            ?
          </Button>
          <Tooltip
            offset={6}
            className="motion-popup max-w-56 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-surface-base shadow-md"
          >
            {help}
          </Tooltip>
        </TooltipTrigger>
      </Heading>
      <DisclosurePanel className="motion-container">
        <div className="pb-4 pt-1">{children}</div>
      </DisclosurePanel>
    </Disclosure>
  );
}
