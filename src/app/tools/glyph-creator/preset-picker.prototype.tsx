"use client";

/**
 * PROTOTYPE — throwaway code for issue #71, "What can a preset picker card
 * honestly promise?". Not production: no tests, no error handling, fabricated
 * preset data. Delete the whole file (and its one mount in `glyph-creator.tsx`)
 * when the question is answered.
 *
 * "Three variants of the shipped-Preset picker, switchable via `?variant=`,
 * mounted as a modal over the existing /tools/glyph-creator editor."
 *
 * The question under test: #65 made a Preset **style-only** — it restyles YOUR
 * selection rather than bringing its own Inputs — so the card can no longer show
 * the exact glyphs you are about to get, and #64's rule *if they see it, they get
 * it* has nothing left to stand on. Each variant proposes a different replacement:
 *
 *   A — the card is a **swatch**: a fixed authored thumbnail, same for everyone.
 *   B — the card is a **ledger**: live over your board, gaps and inert rules counted.
 *   C — there is **no card**: a bare name list drives one full live preview pane.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { GlyphPreview } from "@/components/glyph/glyph-preview";
import { AtlasPreview } from "@/components/glyph/atlas-preview";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { Button } from "@/components/ui/button";
import { getCatalog } from "@/lib/glyph/catalog";
import { resolveDeviceInputs, projectBaseStyle } from "@/lib/glyph/generate";
import { createDeviceFromCatalog } from "@/lib/glyph/presets";
import {
  mergeOverride,
  resolveStyle,
  type StyleOverride,
} from "@/lib/glyph/style";
import type { DeviceConfig, Project, ResolvedInput } from "@/lib/glyph/types";

// --- Fabricated preset data ------------------------------------------------

/** Per-device payload of a Preset: the Device tier plus per-Glyph overrides. */
interface DevicePayload {
  style: StyleOverride;
  glyphStyles?: Record<string, StyleOverride>;
}

/**
 * A shipped Preset as #65 defined it — style-only. A **device** species targets
 * one `catalogId`; a **project** species carries a project tier plus a payload
 * per device it styles.
 */
interface Preset {
  id: string;
  label: string;
  blurb: string;
  species: "device" | "project";
  /** device species only: the Catalog this Preset restyles. */
  catalogId?: string;
  /** device species only. */
  payload?: DevicePayload;
  /** project species only: the project tier, as a patch over the base style. */
  projectStyle?: StyleOverride;
  /** project species only: per-Catalog payloads, i.e. the author's devices. */
  devicePayloads?: Record<string, DevicePayload>;
  /**
   * The Inputs the *author* chose to put on the card. Variant A renders exactly
   * these; B and C ignore them, which is the whole disagreement.
   */
  sample: { catalogId: string; ids: string[] };
  fontFamily?: string;
}

const KEY_ACCENT: StyleOverride = {
  background: { fill: "#f59e0b", border: { color: "#b45309" } },
  textColor: "#1c1917",
};

const PRESETS: Preset[] = [
  {
    id: "paper",
    label: "Paper",
    blurb: "Light keycaps, hairline border, ink labels.",
    species: "device",
    catalogId: "keyboard",
    payload: {
      style: {
        textColor: "#0f172a",
        background: {
          source: { kind: "shape" },
          shape: "rounded-rect",
          fill: "#f8fafc",
          cornerRadius: 22,
          border: { width: 3, color: "#cbd5e1" },
        },
      },
      // Only the movement keys are singled out — deliberately sparse, so the
      // "styles 4 of your 24" gap is visible in variants that count.
      glyphStyles: {
        "key-w": KEY_ACCENT,
        "key-a": KEY_ACCENT,
        "key-s": KEY_ACCENT,
        "key-d": KEY_ACCENT,
        // Off the default selection on purpose: an inert rule, so the variants
        // that count coverage have something to be honest about.
        "key-f5": KEY_ACCENT,
      },
    },
    sample: {
      catalogId: "keyboard",
      ids: ["key-w", "key-a", "key-s", "key-d"],
    },
  },
  {
    id: "slate-mono",
    label: "Slate Mono",
    blurb: "Flat square caps, no border, single ink.",
    species: "device",
    catalogId: "keyboard",
    payload: {
      style: {
        textColor: "#e2e8f0",
        background: {
          source: { kind: "shape" },
          shape: "square",
          fill: "#0f172a",
          border: { width: 0, color: "#0f172a" },
        },
      },
    },
    sample: {
      catalogId: "keyboard",
      ids: ["key-esc", "key-space", "key-e", "key-shift"],
    },
  },
  {
    id: "xbox-brand",
    label: "Xbox — Brand",
    blurb: "Full-saturation face-button discs on the brand palette.",
    species: "device",
    catalogId: "xbox",
    payload: {
      style: {
        background: {
          source: { kind: "shape" },
          shape: "circle",
          fill: "#107c10",
          border: { width: 0, color: "#107c10" },
        },
        symbolPaints: { fill: "#f2fff2" },
      },
      glyphStyles: {
        "xbox-a": { background: { fill: "#107c10" } },
        "xbox-b": { background: { fill: "#d32f2f" } },
        "xbox-x": { background: { fill: "#0e7ac4" } },
        "xbox-y": { background: { fill: "#e5a50a" } },
      },
    },
    sample: {
      catalogId: "xbox",
      ids: ["xbox-a", "xbox-b", "xbox-x", "xbox-y"],
    },
  },
  {
    id: "neon-night",
    label: "Neon Night",
    blurb: "Project-wide magenta/cyan, pads included.",
    species: "project",
    projectStyle: {
      textColor: "#f0abfc",
      background: {
        source: { kind: "shape" },
        shape: "rounded-rect",
        fill: "#18042b",
        cornerRadius: 26,
        border: { width: 5, color: "#e879f9" },
      },
      symbolPaints: {
        fill: "#67e8f9",
        border: "#e879f9",
        secondary: "#a21caf",
      },
    },
    devicePayloads: {
      keyboard: { style: {} },
      xbox: {
        style: { background: { shape: "circle" } },
        glyphStyles: { "xbox-a": { background: { fill: "#3b0764" } } },
      },
    },
    sample: {
      catalogId: "keyboard",
      ids: ["key-w", "key-space", "key-e", "key-f"],
    },
  },
  {
    id: "console-slim",
    label: "Console Slim",
    blurb: "Thin-ring pad buttons; authored against Xbox + PlayStation.",
    species: "project",
    projectStyle: {
      textColor: "#e5e7eb",
      background: {
        source: { kind: "shape" },
        shape: "circle",
        fill: "#111827",
        border: { width: 6, color: "#9ca3af" },
      },
      symbolPaints: {
        fill: "#e5e7eb",
        border: "#6b7280",
        secondary: "#374151",
      },
    },
    devicePayloads: {
      xbox: { style: {} },
      playstation: { style: {} },
    },
    sample: {
      catalogId: "xbox",
      ids: ["xbox-a", "xbox-b", "xbox-lb", "xbox-menu"],
    },
  },
];

// --- Applying a preset (the #65 rules, roughly) ----------------------------

/** The Catalogs a Preset touches — one for a device species, several for project. */
function targetCatalogIds(preset: Preset): string[] {
  return preset.species === "device"
    ? [preset.catalogId!]
    : Object.keys(preset.devicePayloads ?? {});
}

/** Style a Device with a payload: Device tier replaced, per-Glyph tier merged. */
function styleDevice(
  device: DeviceConfig,
  payload: DevicePayload,
): DeviceConfig {
  const glyphStyles = { ...device.glyphStyles };
  for (const [id, override] of Object.entries(payload.glyphStyles ?? {})) {
    glyphStyles[id] = mergeOverride(glyphStyles[id] ?? {}, override);
  }
  return { ...device, style: payload.style, glyphStyles };
}

/** The Preset's per-Device payloads, keyed by Catalog id, for either species. */
function payloadsOf(preset: Preset): Record<string, DevicePayload> {
  return preset.species === "device"
    ? { [preset.catalogId!]: preset.payload! }
    : (preset.devicePayloads ?? {});
}

/**
 * Which Devices are **taken** by default: the ones this project doesn't carry.
 *
 * Taking is about *presence*, so the default follows #65's asymmetry — adding a
 * Device you lack costs you nothing, while replacing the Inputs on a Device you
 * already curated is the most destructive thing the picker can do, so it stays
 * opt-in per Device.
 */
function defaultTaken(project: Project, preset: Preset): Set<string> {
  const have = new Set(project.devices.map((d) => d.catalogId));
  return new Set(targetCatalogIds(preset).filter((id) => !have.has(id)));
}

/**
 * Apply a Preset to a Project. Style always lands on every Device you have that
 * the Preset covers; `taken` governs **presence**, per Device:
 *
 * - absent + taken — the Device is created from its Catalog's Default Selection.
 * - absent + untaken — the Preset's payload for it lands nowhere.
 * - present + taken — your selection is replaced by the Default Selection.
 * - present + untaken — your selection survives; only the style changes.
 *
 * A Project species additionally rewrites the Project tier, which has no Device
 * to be taken or not.
 */
function applyPreset(
  project: Project,
  preset: Preset,
  taken: Set<string> = defaultTaken(project, preset),
): Project {
  const devices = [...project.devices];

  for (const [catalogId, payload] of Object.entries(payloadsOf(preset))) {
    const catalog = getCatalog(catalogId);
    if (!catalog) continue;
    const index = devices.findIndex((d) => d.catalogId === catalogId);
    if (index >= 0) {
      const base = taken.has(catalogId)
        ? { ...devices[index], enabled: [...catalog.preset], custom: [] }
        : devices[index];
      devices[index] = styleDevice(base, payload);
    } else if (taken.has(catalogId)) {
      devices.push(styleDevice(createDeviceFromCatalog(catalog), payload));
    }
  }

  const next = { ...project, devices };
  if (preset.species !== "project") return next;

  const base = resolveStyle(projectBaseStyle(project), preset.projectStyle);
  return {
    ...next,
    textColor: base.textColor,
    background: base.background,
    symbolPaints: base.symbolPaints,
    contentScale: base.contentScale,
  };
}

// --- What the card could honestly say --------------------------------------

interface Coverage {
  catalogId: string;
  deviceName: string;
  /** The Device is absent from this project, so applying creates it. */
  creates: boolean;
  /** Inputs enabled on your Device (or the Default Selection, if creating). */
  yours: number;
  /** Of `yours`, how many the Preset styles individually. */
  styled: number;
  /** Preset rules that land on nothing you have enabled. */
  inert: number;
}

function coverageFor(project: Project, preset: Preset): Coverage[] {
  return targetCatalogIds(preset).flatMap((catalogId) => {
    const catalog = getCatalog(catalogId);
    if (!catalog) return [];
    const payload =
      preset.species === "device"
        ? preset.payload!
        : preset.devicePayloads![catalogId];
    const device = project.devices.find((d) => d.catalogId === catalogId);
    const enabled = device ? device.enabled : catalog.preset;
    const keys = Object.keys(payload.glyphStyles ?? {});
    const styled = keys.filter((k) => enabled.includes(k)).length;
    return [
      {
        catalogId,
        deviceName: catalog.name,
        creates: !device,
        yours: enabled.length,
        styled,
        inert: keys.length - styled,
      },
    ];
  });
}

/** The Glyphs a Preset would produce on `catalogId`, resolved through the cascade. */
function previewInputs(
  project: Project,
  preset: Preset,
  catalogId: string,
  limit?: number,
): ResolvedInput[] {
  const next = applyPreset(project, preset);
  const device = next.devices.find((d) => d.catalogId === catalogId);
  if (!device) return [];
  const inputs = resolveDeviceInputs(device, next);
  return limit ? inputs.slice(0, limit) : inputs;
}

/** Which of those Glyphs the Preset styled individually (the rest fall back). */
function styledIds(preset: Preset, catalogId: string): Set<string> {
  const payload =
    preset.species === "device"
      ? preset.payload
      : preset.devicePayloads?.[catalogId];
  return new Set(Object.keys(payload?.glyphStyles ?? {}));
}

// --- Shared bits -----------------------------------------------------------

function Tile({
  input,
  fontFamily,
  catalogId,
  size = 56,
}: {
  input: ResolvedInput;
  fontFamily: string;
  catalogId: string;
  size?: number;
}) {
  return (
    <GlyphPreview
      label={input.label}
      cellSize={96}
      textColor={input.style.textColor}
      background={input.style.background}
      symbolPaints={input.style.symbolPaints}
      contentScale={input.style.contentScale}
      fontFamily={fontFamily}
      symbolId={input.symbolId}
      device={catalogId}
      style={{ width: size, height: size }}
    />
  );
}

/** Variants A and B only — C drops the chip and lets the Apply button say it. */
function SpeciesChip({ preset }: { preset: Preset }) {
  const device = preset.species === "device";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        device ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"
      }`}
    >
      {device
        ? `Device · ${getCatalog(preset.catalogId!)?.name ?? preset.catalogId}`
        : "Project"}
    </span>
  );
}

/**
 * The Devices a Preset covers, one tag each — the honest answer to "what does
 * this touch?" that reads the same for both species, so a Project Preset stops
 * saying the uselessly vague "whole project". A tag the current project has no
 * Device for is drawn hollow: the Preset styles it, you just aren't carrying it.
 */
function DeviceTags({
  preset,
  project,
  onPrimary = false,
}: {
  preset: Preset;
  project: Project;
  /** Drawn on a `bg-primary` row (the selected item), which needs its own ink. */
  onPrimary?: boolean;
}) {
  const have = new Set(project.devices.map((d) => d.catalogId));
  return (
    <span className="flex flex-wrap gap-1">
      {targetCatalogIds(preset).map((catalogId) => {
        const mine = have.has(catalogId);
        return (
          <span
            key={catalogId}
            title={
              mine
                ? "You have this Device"
                : "You have no Device on this Catalog"
            }
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              onPrimary
                ? mine
                  ? "bg-primary-foreground/25 text-primary-foreground"
                  : "border border-dashed border-primary-foreground/60 text-primary-foreground/80"
                : mine
                  ? "bg-sky-500/15 text-sky-300"
                  : "border border-dashed border-muted-foreground/60 text-muted-foreground"
            }`}
          >
            {getCatalog(catalogId)?.name ?? catalogId}
          </span>
        );
      })}
    </span>
  );
}

// --- Variant A — the card is a swatch --------------------------------------

/**
 * The card shows a **fixed authored thumbnail**: the four Inputs the preset's
 * author picked, in the preset's own style, identical in every project. It
 * promises the *look*, not your board — so the replacement rule reads
 * "what you see is the palette; what you get is your board in it".
 * The only project-specific line is what applying would add.
 */
function VariantA({ project, onApply }: VariantProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {PRESETS.map((preset) => {
        const sampleProject = applyPreset(project, preset);
        const device = sampleProject.devices.find(
          (d) => d.catalogId === preset.sample.catalogId,
        );
        const inputs = device
          ? resolveDeviceInputs(device, sampleProject).filter((i) =>
              preset.sample.ids.includes(i.id),
            )
          : [];
        // Only a Device Preset creates a Device (#65); a Project Preset naming a
        // Device you lack simply has nowhere to land.
        const creates =
          preset.species === "device"
            ? coverageFor(project, preset).filter((c) => c.creates)
            : [];
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApply(preset)}
            className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-left transition hover:border-ring hover:shadow-md"
          >
            <div className="flex items-center justify-center gap-1.5 rounded-md bg-black/30 p-3">
              {inputs.map((input) => (
                <Tile
                  key={input.id}
                  input={input}
                  fontFamily={project.font.family}
                  catalogId={preset.sample.catalogId}
                />
              ))}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{preset.label}</span>
                <SpeciesChip preset={preset} />
              </div>
              <p className="text-xs text-muted-foreground">{preset.blurb}</p>
              {creates.length > 0 && (
                <p className="text-xs text-emerald-400">
                  + adds {creates.map((c) => c.deviceName).join(", ")}
                </p>
              )}
              {preset.species === "project" && (
                <p className="text-xs text-amber-400">
                  asks about replacing your Inputs
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// --- Variant B — the card is a ledger --------------------------------------

/**
 * The card is rendered **live against this project** and states its own limits:
 * how many of your Inputs it styles individually, how many fall back to the
 * device look (drawn dashed), and how many of its rules land on nothing you have
 * enabled. Two users see different cards for one preset — that is the price.
 */
function VariantB({ project, onApply }: VariantProps) {
  return (
    <div className="space-y-3">
      {PRESETS.map((preset) => {
        const coverage = coverageFor(project, preset);
        return (
          <div
            key={preset.id}
            className="rounded-lg border bg-card p-3 transition hover:border-ring"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold">{preset.label}</span>
              <SpeciesChip preset={preset} />
              <span className="text-xs text-muted-foreground">
                {preset.blurb}
              </span>
              <Button
                type="button"
                className="ml-auto"
                onClick={() => onApply(preset)}
              >
                Apply
              </Button>
            </div>

            {coverage.map((c) => {
              const inputs = previewInputs(project, preset, c.catalogId, 10);
              const styled = styledIds(preset, c.catalogId);
              return (
                <div key={c.catalogId} className="mb-2 last:mb-0">
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-black/30 p-2">
                    {inputs.map((input) => (
                      <span
                        key={input.id}
                        className={
                          styled.has(input.id)
                            ? "rounded-sm ring-1 ring-emerald-400/70"
                            : "rounded-sm border border-dashed border-muted-foreground/50 opacity-80"
                        }
                      >
                        <Tile
                          input={input}
                          fontFamily={project.font.family}
                          catalogId={c.catalogId}
                          size={44}
                        />
                      </span>
                    ))}
                    {c.yours > inputs.length && (
                      <span className="self-center px-1 text-xs text-muted-foreground">
                        +{c.yours - inputs.length} more
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.creates && preset.species === "device" ? (
                      <span className="text-emerald-400">
                        creates {c.deviceName} with its {c.yours} default Inputs
                        ·{" "}
                      </span>
                    ) : c.creates ? (
                      <span className="text-amber-400">
                        you have no {c.deviceName} Device — this part does
                        nothing unless you also replace your Inputs
                      </span>
                    ) : (
                      <>
                        styles {c.styled} of your {c.yours} {c.deviceName}{" "}
                        Inputs individually · {c.yours - c.styled} take the
                        device look ·{" "}
                      </>
                    )}
                    {!(c.creates && preset.species === "project") &&
                      (c.inert > 0 ? (
                        <span className="text-amber-400">
                          {c.inert} of its rules land on Inputs you don&apos;t
                          have
                        </span>
                      ) : (
                        <span>no unused rules</span>
                      ))}
                  </p>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// --- Variant C — no card at all --------------------------------------------

/**
 * There is nothing to promise on a card, because the card isn't the promise: a
 * name list on the left carrying a **thumbnail strip** at rail scale, and the
 * right pane is the real atlas, live-restyled as you move through the list.
 *
 * Presence is a **per-Device toggle**, not one blanket question: every Device the
 * Preset covers gets a tab that both selects the preview and decides whether you
 * take that Device. A Device you don't have still previews — the Preset's own
 * Default Selection — with the note that applying will add it.
 */
function VariantC({ project, onApply }: VariantProps) {
  const [selected, setSelected] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === selected)!;
  const targets = targetCatalogIds(preset);
  const have = new Set(project.devices.map((d) => d.catalogId));

  // Per-Device take decisions, keyed `<presetId>:<catalogId>` so flipping through
  // the list doesn't lose what you already decided. Unset falls to the default.
  const [takeOverrides, setTakeOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const defaults = defaultTaken(project, preset);
  const isTaken = (catalogId: string) =>
    takeOverrides[`${preset.id}:${catalogId}`] ?? defaults.has(catalogId);
  const taken = new Set(targets.filter(isTaken));

  // The preview materializes every covered Device, taken or not, so an untaken
  // absent Device is still visible — you just get told it won't be added.
  const previewProject = useMemo(
    () => applyPreset(project, preset, new Set([...taken, ...targets])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, preset, [...taken].join()],
  );
  const previewable = previewProject.devices.filter((d) =>
    targets.includes(d.catalogId),
  );
  const [previewCatalog, setPreviewCatalog] = useState<string | null>(null);
  const device =
    previewable.find((d) => d.catalogId === previewCatalog) ?? previewable[0];

  return (
    <div className="flex h-[62vh] gap-4">
      <ul className="w-64 shrink-0 space-y-1 overflow-y-auto">
        {PRESETS.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setSelected(p.id)}
              className={`w-full rounded-md px-2.5 py-2 text-left text-sm ${
                p.id === selected
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <RailThumbnail preset={p} project={project} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.label}</span>
                  <span className="mt-1 block">
                    <DeviceTags
                      preset={p}
                      project={project}
                      onPrimary={p.id === selected}
                    />
                  </span>
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{preset.label}</span>
          <span className="text-xs text-muted-foreground">{preset.blurb}</span>
          {/* The species is said by the *action*, not a chip. */}
          <Button
            type="button"
            className="ml-auto"
            onClick={() => onApply(preset, taken)}
          >
            {preset.species === "device"
              ? `Apply to ${getCatalog(preset.catalogId!)?.name ?? preset.catalogId}`
              : "Apply to Project"}
          </Button>
        </div>

        {/* One row that says everything about presence: what's covered, what
            you're looking at, and what you'll walk away with. */}
        <div className="flex flex-wrap items-center gap-2">
          {previewable.map((d) => {
            const active = d.catalogId === device?.catalogId;
            return (
              <span
                key={d.catalogId}
                className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-xs ${
                  active ? "border-ring bg-muted" : "border-input"
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`Take ${d.name}`}
                  checked={isTaken(d.catalogId)}
                  onChange={(e) =>
                    setTakeOverrides((prev) => ({
                      ...prev,
                      [`${preset.id}:${d.catalogId}`]: e.target.checked,
                    }))
                  }
                  className="ml-1.5"
                />
                <button
                  type="button"
                  onClick={() => setPreviewCatalog(d.catalogId)}
                  className={active ? "font-semibold" : ""}
                >
                  {d.name}
                </button>
              </span>
            );
          })}
          {device && (
            <span className="text-xs text-muted-foreground">
              {takeNote(
                preset,
                device.catalogId,
                have,
                isTaken(device.catalogId),
              )}
            </span>
          )}
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border bg-muted/20 p-3">
          {device ? (
            <AtlasPreview
              deviceName={device.name}
              glyphs={resolveDeviceInputs(device, previewProject)}
              cellSize={previewProject.cellSize}
              fontFamily={previewProject.font.family}
              catalogId={device.catalogId}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This Preset covers no Device this tool knows.
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Nothing is committed until you Apply.
        </p>
      </div>
    </div>
  );
}

/** What taking (or not taking) this Device costs you, in one sentence. */
function takeNote(
  preset: Preset,
  catalogId: string,
  have: Set<string>,
  taken: boolean,
): string {
  const catalog = getCatalog(catalogId);
  const name = catalog?.name ?? catalogId;
  const count = catalog?.preset.length ?? 0;
  if (!have.has(catalogId)) {
    return taken
      ? `Applying adds ${name} with its ${count} default Inputs.`
      : `Preview only — ${name} won't be added.`;
  }
  return taken
    ? `Replaces your ${name} Inputs with the ${count} default ones.`
    : `Your ${name} Inputs are kept; only the style changes.`;
}

/**
 * The four Inputs every thumbnail draws, per Catalog — the face buttons on a pad,
 * WASD on a keyboard. Fixed rather than author-chosen so the rail is a *set* of
 * comparable swatches: the same four controls in each Preset's look, which is the
 * only way flipping down the list compares looks instead of comparing subjects.
 */
const THUMBNAIL_SAMPLE: Record<string, string[]> = {
  keyboard: ["key-w", "key-a", "key-s", "key-d"],
  xbox: ["xbox-a", "xbox-b", "xbox-x", "xbox-y"],
  playstation: ["ps-cross", "ps-circle", "ps-square", "ps-triangle"],
};

/**
 * The rail-scale thumbnail: four fixed tiles in the Preset's look. Fixed art —
 * it is the Preset's *look*, so it doesn't move with whose project is open.
 */
function RailThumbnail({
  preset,
  project,
}: {
  preset: Preset;
  project: Project;
}) {
  const catalogId = targetCatalogIds(preset)[0];
  const ids = THUMBNAIL_SAMPLE[catalogId] ?? [];
  const sampleProject = applyPreset(project, preset);
  const device = sampleProject.devices.find((d) => d.catalogId === catalogId);
  const inputs = device
    ? resolveDeviceInputs(device, sampleProject).filter((i) =>
        ids.includes(i.id),
      )
    : [];
  return (
    <span className="grid shrink-0 grid-cols-2 gap-0.5 rounded bg-black/30 p-1">
      {inputs.slice(0, 4).map((input) => (
        <Tile
          key={input.id}
          input={input}
          fontFamily={project.font.family}
          catalogId={catalogId}
          size={18}
        />
      ))}
    </span>
  );
}

// --- Mount -----------------------------------------------------------------

interface VariantProps {
  project: Project;
  /** `taken` names the Devices whose *presence* the user opted into (see applyPreset). */
  onApply: (preset: Preset, taken?: Set<string>) => void;
}

const VARIANTS: Record<
  string,
  { name: string; render: React.FC<VariantProps> }
> = {
  A: { name: "Swatch grid (fixed thumbnail)", render: VariantA },
  B: { name: "Truth rows (live + coverage ledger)", render: VariantB },
  C: { name: "Master–detail (no cards, one live pane)", render: VariantC },
};

const VARIANT_NAMES = Object.fromEntries(
  Object.entries(VARIANTS).map(([k, v]) => [k, v.name]),
);

/**
 * The prototype's whole footprint on the editor: a launcher button, the modal,
 * and the variant switcher. `onApply` hands the caller a restyled Project; the
 * caller may dispatch it (`load-project`) so the effect on the real editor is
 * visible — the prototype itself mutates nothing.
 */
export function PresetPickerPrototype({
  project,
  onApply,
}: {
  project: Project;
  onApply: (next: Project) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [variant, setVariant] = useState("A");
  const Variant = VARIANTS[variant]?.render ?? VariantA;

  // `?variant=` drives the choice so a variant is shareable and reload-stable.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("variant");
    if (fromUrl && VARIANTS[fromUrl]) setVariant(fromUrl);
  }, []);

  function chooseVariant(next: string) {
    setVariant(next);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
  }

  function apply(preset: Preset, taken?: Set<string>) {
    onApply(applyPreset(project, preset, taken));
    dialogRef.current?.close();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="fixed bottom-20 right-6 z-50 border-fuchsia-500"
        onClick={() => dialogRef.current?.showModal()}
      >
        Presets… (prototype)
      </Button>

      <dialog
        ref={dialogRef}
        aria-label="Presets"
        className="fixed inset-0 m-auto h-fit max-h-[88vh] w-[min(1100px,92vw)] rounded-lg border bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="max-h-[88vh] overflow-y-auto p-5 pb-16">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold">Presets</h2>
            <span className="text-xs text-muted-foreground">
              variant {variant} — {VARIANTS[variant]?.name}
            </span>
            <Button
              type="button"
              variant="outline"
              className="ml-auto"
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </Button>
          </div>
          <Variant project={project} onApply={apply} />
        </div>
        <PrototypeSwitcher
          variants={Object.keys(VARIANTS)}
          current={variant}
          onChange={chooseVariant}
          names={VARIANT_NAMES}
        />
      </dialog>
    </>
  );
}
