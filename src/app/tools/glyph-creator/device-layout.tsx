"use client";

import { type Dispatch, type KeyboardEvent } from "react";
import { catalogIndex, getCatalog } from "@/lib/glyph/catalog";
import {
  KEYBOARD_LAYOUT,
  getPadLayout,
  keyboardExtent,
  type PadNode,
} from "@/lib/glyph/layout";
import type { ProjectAction } from "@/lib/glyph/project";
import type { DeviceConfig } from "@/lib/glyph/types";

/**
 * The code-drawn **Device Layout** (ADR-0005): a Device's Catalog rendered as a
 * clickable schematic for enabling Inputs. The keyboard is a US-staggered
 * rounded-rect keycap board; the pads are clustered nodes over a prototype
 * controller outline. Enabled Inputs read filled/pressed, disabled ones dimmed;
 * clicking one toggles it, which the live preview reflects.
 *
 * This is editor chrome only — the geometry (see `layout.ts`) never reaches an
 * exported Sprite Atlas. Pad nodes show their label as a placeholder until
 * Symbols land.
 */
/**
 * What each diagram needs to render and drive one Device's Layout: its name, how
 * to resolve an id's label and enabled state, and how to toggle it. Bundled so
 * the keyboard and pad diagrams share one prop rather than four parallel ones.
 */
interface DeviceView {
  deviceName: string;
  label: (id: string) => string;
  isEnabled: (id: string) => boolean;
  onToggle: (id: string) => void;
}

export function DeviceLayout({
  device,
  deviceIndex,
  dispatch,
}: {
  device: DeviceConfig;
  deviceIndex: number;
  dispatch: Dispatch<ProjectAction>;
}) {
  const catalog = getCatalog(device.catalogId);
  if (!catalog) return null;

  const labels = catalogIndex(catalog);
  const enabled = new Set(device.enabled);
  const view: DeviceView = {
    deviceName: device.name,
    label: (id) => labels.get(id)?.label ?? id,
    isEnabled: (id) => enabled.has(id),
    onToggle: (inputId) => dispatch({ type: "toggle-input", deviceIndex, inputId }),
  };

  const pad = getPadLayout(device.catalogId);
  return pad ? (
    <PadDiagram pad={pad} view={view} />
  ) : (
    <KeyboardDiagram view={view} />
  );
}

// --- Shared interaction ----------------------------------------------------

/** Toggle on Enter / Space, so an SVG node behaves like a real button. */
function toggleKeyHandler(onToggle: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };
}

/** Fill/text classes for an enabled vs. disabled node — disabled reads dimmed. */
function nodeClasses(on: boolean) {
  return on
    ? { shape: "fill-primary stroke-primary", text: "fill-primary-foreground" }
    : { shape: "fill-muted stroke-border", text: "fill-muted-foreground" };
}

/**
 * The largest font size (in the SVG's own units) at which `label` fits within
 * `maxWidth`, clamped so tiny keys stay legible. Uses a rough average glyph
 * width so long legends (Backspace, Options) shrink instead of overflowing.
 */
function fitFontSize(label: string, maxWidth: number, cap: number, floor: number) {
  const approx = maxWidth / (Math.max(label.length, 1) * 0.6);
  return Math.max(floor, Math.min(cap, approx));
}

// --- Keyboard --------------------------------------------------------------

function KeyboardDiagram({ view }: { view: DeviceView }) {
  const { deviceName, label, isEnabled, onToggle } = view;
  const { width, height } = keyboardExtent();
  const pad = 0.15;
  return (
    <svg
      role="group"
      aria-label={`${deviceName} Layout`}
      viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
      className="w-full select-none"
    >
      {KEYBOARD_LAYOUT.map((cap) => {
        const on = isEnabled(cap.id);
        const cls = nodeClasses(on);
        const text = label(cap.id);
        return (
          <g
            key={cap.id}
            role="button"
            aria-label={text}
            aria-pressed={on}
            tabIndex={0}
            onClick={() => onToggle(cap.id)}
            onKeyDown={toggleKeyHandler(() => onToggle(cap.id))}
            className="cursor-pointer outline-none [&:focus-visible_rect]:stroke-ring [&:hover_rect]:opacity-80"
          >
            <rect
              x={cap.x + 0.05}
              y={cap.y + 0.05}
              width={cap.w - 0.1}
              height={cap.h - 0.1}
              rx={0.12}
              strokeWidth={0.04}
              className={cls.shape}
            />
            <text
              x={cap.x + cap.w / 2}
              y={cap.y + cap.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fitFontSize(text, cap.w - 0.15, 0.34, 0.16)}
              className={`${cls.text} pointer-events-none`}
            >
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// --- Pads ------------------------------------------------------------------

function PadDiagram({
  pad,
  view,
}: {
  pad: ReturnType<typeof getPadLayout> & object;
  view: DeviceView;
}) {
  const { deviceName, label, isEnabled, onToggle } = view;
  return (
    <svg
      role="group"
      aria-label={`${deviceName} Layout`}
      viewBox={`0 0 ${pad.viewBox.width} ${pad.viewBox.height}`}
      className="w-full select-none"
    >
      {/* Prototype controller outline, purely decorative, drawn behind the nodes. */}
      <path
        data-outline
        d={pad.outline}
        className="fill-muted/30 stroke-border"
        strokeWidth={2}
      />
      {pad.nodes.map((node) => (
        <PadButton
          key={node.id}
          node={node}
          label={label(node.id)}
          on={isEnabled(node.id)}
          onToggle={() => onToggle(node.id)}
        />
      ))}
    </svg>
  );
}

/** One clustered pad node: a circle with its label placeholder inside. */
function PadButton({
  node,
  label,
  on,
  onToggle,
}: {
  node: PadNode;
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  const cls = nodeClasses(on);
  const glyph = padGlyph(node.id, label);
  return (
    <g
      role="button"
      aria-label={label}
      aria-pressed={on}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={toggleKeyHandler(onToggle)}
      className="cursor-pointer outline-none [&:focus-visible_circle]:stroke-ring [&:hover_circle]:opacity-80"
    >
      <title>{label}</title>
      <circle cx={node.x} cy={node.y} r={node.r} strokeWidth={1.5} className={cls.shape} />
      <text
        x={node.x}
        y={node.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fitFontSize(glyph, node.r * 1.7, 9, 5)}
        className={`${cls.text} pointer-events-none`}
      >
        {glyph}
      </text>
    </g>
  );
}

/**
 * A short in-node placeholder for a pad Input (Symbols will replace these). Short
 * labels (A, LB, R2) show as-is; sticks and d-pad directions get compact glyphs;
 * anything else falls back to the label, shrunk to fit by {@link fitFontSize}.
 */
function padGlyph(id: string, label: string): string {
  if (id.endsWith("left-stick")) return "LS";
  if (id.endsWith("right-stick")) return "RS";
  if (id.endsWith("dpad-up")) return "↑";
  if (id.endsWith("dpad-down")) return "↓";
  if (id.endsWith("dpad-left")) return "←";
  if (id.endsWith("dpad-right")) return "→";
  return label;
}
