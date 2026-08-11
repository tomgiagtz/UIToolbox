"use client";

import { type Dispatch, type KeyboardEvent, type SVGProps } from "react";
import { catalogIndex, getCatalog } from "@/lib/glyph/catalog";
import {
  KEYBOARD_LAYOUT,
  MOUSE_LAYOUT,
  MOUSE_PLACEMENT,
  getPadLayout,
  keyboardExtent,
  type PadButtonShape,
  type PadLayout,
} from "@/lib/glyph/layout";
import type { ProjectAction } from "@/lib/glyph/project";
import {
  recolorSymbolSvg,
  symbolInner,
  type RoleColors,
  type SymbolInner,
} from "@/lib/glyph/symbol-render";
import { getSymbolSvg, isClusterArt } from "@/lib/glyph/symbols";
import type { DeviceConfig } from "@/lib/glyph/types";

/**
 * The Layout draws Symbols in the node's own text colour, so every paint role
 * resolves to `currentColor` — the enabled/disabled theme token set on the node.
 */
const CURRENT_COLOR_ROLES: RoleColors = {
  fill: "currentColor",
  border: "currentColor",
  secondary: "currentColor",
};

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
  /** What to draw inside the node; see {@link NodeContent}. Issue #17. */
  content: (id: string) => NodeContent;
}

/**
 * What a pad node draws on top of its shape:
 *
 * - `symbol` — the Input's Symbol Render Source, recoloured to `currentColor`.
 * - `label` — the short text placeholder, for Inputs with no Symbol art.
 * - `none` — nothing, because the Layout's own geometry already depicts the
 *   Input. That is the d-pad and the mouse: their Symbols are cluster art (all
 *   four arms; the whole mouse body), so drawing one inside a single node would
 *   nest a whole d-pad in a quarter of itself, or a whole mouse inside one of
 *   its buttons — and it would only repeat what the node's shape already says.
 */
type NodeContent =
  | { kind: "symbol"; symbol: SymbolInner }
  | { kind: "label" }
  | { kind: "none" };

/**
 * The code-drawn **Device Layout** (ADR-0005): a Device's Catalog rendered as a
 * clickable schematic for enabling Inputs. The keyboard is a US-staggered
 * rounded-rect keycap board with a mouse schematic beside it; the pads are
 * clustered nodes over a prototype controller outline. Enabled Inputs read
 * filled/pressed, disabled ones dimmed; clicking one toggles it, which the live
 * preview reflects.
 *
 * This is editor chrome only — the geometry (see `layout.ts`) never reaches an
 * exported Sprite Atlas. Pad nodes draw their Symbol where they have one and a
 * short label placeholder otherwise (see {@link NodeContent}).
 */
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

  const entries = catalogIndex(catalog);
  const enabled = new Set(device.enabled);
  const view: DeviceView = {
    deviceName: device.name,
    label: (id) => entries.get(id)?.label ?? id,
    isEnabled: (id) => enabled.has(id),
    onToggle: (inputId) =>
      dispatch({ type: "toggle-input", deviceIndex, inputId }),
    content: (id) => {
      const symbolId = entries.get(id)?.symbolId;
      if (!symbolId) return { kind: "label" };
      // Cluster art describes the whole d-pad, which the Layout already draws.
      if (isClusterArt(symbolId)) return { kind: "none" };
      const raw = getSymbolSvg(symbolId, device.catalogId);
      const symbol = raw
        ? symbolInner(recolorSymbolSvg(raw, CURRENT_COLOR_ROLES))
        : undefined;
      return symbol ? { kind: "symbol", symbol } : { kind: "label" };
    },
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

/**
 * Fill/border/text classes for an enabled vs. disabled Input — disabled reads
 * dimmed. Uses the dedicated `--input-*` theme tokens (see `globals.css`) so the
 * Device Layout can be themed apart from the app's buttons.
 */
function nodeClasses(on: boolean) {
  return on
    ? {
        shape: "fill-input-fill-primary stroke-input-border-primary",
        text: "fill-primary-foreground",
        // `text-*` sets CSS `color`, which the inline Symbol reads via currentColor.
        symbol: "text-primary-foreground",
      }
    : {
        shape: "fill-input-fill-muted stroke-input-border-muted",
        text: "fill-muted-foreground",
        symbol: "text-muted-foreground",
      };
}

/**
 * The largest font size (in the SVG's own units) at which `label` fits within
 * `maxWidth`, clamped so tiny keys stay legible. Uses a rough average glyph
 * width so long legends (Backspace, Options) shrink instead of overflowing.
 */
function fitFontSize(
  label: string,
  maxWidth: number,
  cap: number,
  floor: number,
) {
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
      {/*
        The mouse: its own Layout, scaled from its coordinate space into the
        key-unit slot beside the board. Nesting an `<svg>` is what lets the two
        coordinate systems coexist — the keycaps stay in key-units and the mouse
        keeps whatever units its authored art was drawn in.
      */}
      <svg
        role="group"
        aria-label="Mouse buttons"
        x={MOUSE_PLACEMENT.x}
        y={MOUSE_PLACEMENT.y}
        width={MOUSE_PLACEMENT.w}
        height={MOUSE_PLACEMENT.h}
        viewBox={`0 0 ${MOUSE_LAYOUT.viewBox.width} ${MOUSE_LAYOUT.viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <PadNodes layout={MOUSE_LAYOUT} view={view} />
      </svg>
    </svg>
  );
}

// --- Pads ------------------------------------------------------------------

function PadDiagram({ pad, view }: { pad: PadLayout; view: DeviceView }) {
  return (
    <svg
      role="group"
      aria-label={`${view.deviceName} Layout`}
      viewBox={`0 0 ${pad.viewBox.width} ${pad.viewBox.height}`}
      className="w-full select-none"
    >
      <PadNodes layout={pad} view={view} />
    </svg>
  );
}

/**
 * A {@link PadLayout}'s contents in its own coordinate space — the decoration
 * blob and the clickable buttons — without an outer `<svg>`, so the same nodes
 * serve a pad's whole diagram and the mouse nested inside the keyboard's.
 */
function PadNodes({ layout, view }: { layout: PadLayout; view: DeviceView }) {
  const { label, isEnabled, onToggle } = view;
  return (
    <>
      {/*
        The outline and any non-interactive backer shapes, drawn behind the
        buttons and painted verbatim from the authored (or code-drawn) source.
        Trusted, committed markup; `pointer-events-none` lets clicks reach buttons.
      */}
      <g
        data-decoration
        className="[&_*]:pointer-events-none"
        dangerouslySetInnerHTML={{ __html: layout.decoration }}
      />
      {layout.buttons.map((shape) => (
        <PadButton
          key={shape.id}
          shape={shape}
          label={label(shape.id)}
          content={view.content(shape.id)}
          on={isEnabled(shape.id)}
          onToggle={() => onToggle(shape.id)}
        />
      ))}
    </>
  );
}

/** The SVG geometry attribute names a pad button shape may carry. */
type GeomAttrs = Pick<
  SVGProps<SVGPathElement & SVGCircleElement & SVGRectElement>,
  | "d"
  | "cx"
  | "cy"
  | "r"
  | "rx"
  | "ry"
  | "x"
  | "y"
  | "width"
  | "height"
  | "points"
  | "transform"
>;

/**
 * One clickable pad button: the authored (or code-drawn) shape rendered directly,
 * recoloured by enabled state. The Catalog's authored fill is stripped at ingest
 * so the whole footprint takes `fill-primary` (enabled) / `fill-muted` (disabled).
 * For this to be clickable across the button, author each shape **solid** (a
 * filled region), not as a hollow outline ring. Over the footprint it draws its
 * {@link NodeContent} in the node's text colour, centred on the shape's measured
 * centre — shapes too irregular to measure report none and stay bare (issue #17).
 */
function PadButton({
  shape,
  label,
  content,
  on,
  onToggle,
}: {
  shape: PadButtonShape;
  label: string;
  content: NodeContent;
  on: boolean;
  onToggle: () => void;
}) {
  const cls = nodeClasses(on);
  const Shape = shape.tag as "path";
  const glyph = padGlyph(shape.id, label);
  const at = shape.contentAt;
  return (
    <g
      role="button"
      aria-label={label}
      aria-pressed={on}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={toggleKeyHandler(onToggle)}
      className="cursor-pointer outline-none [&:focus-visible_[data-shape]]:stroke-ring [&:hover_[data-shape]]:opacity-80"
    >
      <title>{label}</title>
      <Shape
        data-shape
        {...(shape.geom as GeomAttrs)}
        // Honour the even-odd rule so any intentional holes in the authored shape
        // (e.g. a symbol counter) stay open; solid shapes fill either way.
        fillRule="evenodd"
        strokeWidth={1.5}
        className={cls.shape}
      />
      {at &&
        (content.kind === "symbol" ? (
          <svg
            x={at.x - at.r}
            y={at.y - at.r}
            width={at.r * 2}
            height={at.r * 2}
            viewBox={content.symbol.viewBox}
            preserveAspectRatio="xMidYMid meet"
            className={`${cls.symbol} pointer-events-none`}
            dangerouslySetInnerHTML={{ __html: content.symbol.inner }}
          />
        ) : content.kind === "label" ? (
          <text
            x={at.x}
            y={at.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fitFontSize(glyph, at.r * 1.7, 9, 5)}
            className={`${cls.text} pointer-events-none`}
          >
            {glyph}
          </text>
        ) : null)}
    </g>
  );
}

/**
 * A short in-node placeholder for a pad Input that has no Symbol art. Short
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
