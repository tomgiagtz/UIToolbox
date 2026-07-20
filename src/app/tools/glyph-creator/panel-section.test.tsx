import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DisclosureGroup } from "react-aria-components";
import { PanelSection } from "./panel-section";

function renderSection(defaultExpanded = false) {
  return render(
    <DisclosureGroup defaultExpandedKeys={defaultExpanded ? ["devices"] : []}>
      <PanelSection
        id="devices"
        title="Devices"
        help="Pick which Devices to generate."
      >
        <p>Device controls</p>
      </PanelSection>
    </DisclosureGroup>,
  );
}

describe("PanelSection", () => {
  it("renders a trigger for the section title", () => {
    renderSection();
    expect(screen.getByRole("button", { name: "Devices" })).toBeInTheDocument();
  });

  it("hides panel content until the section is expanded", async () => {
    const user = userEvent.setup();
    renderSection(false);

    // react-aria keeps the panel mounted but hidden while collapsed.
    expect(screen.getByText("Device controls")).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: "Devices" }));
    expect(screen.getByText("Device controls")).toBeVisible();
  });

  it("exposes a help affordance describing the section", () => {
    renderSection();
    expect(
      screen.getByRole("button", { name: /About Devices/i }),
    ).toBeInTheDocument();
  });

  it("shows the help text on focusing the help affordance", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.tab();
    await user.tab(); // move focus onto the help button
    const tip = await screen.findByText(/Pick which Devices to generate/i);
    expect(tip).toBeInTheDocument();
  });
});
