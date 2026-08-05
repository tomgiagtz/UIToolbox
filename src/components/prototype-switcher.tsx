"use client";

/**
 * PROTOTYPE — throwaway. Floating variant switcher for `/prototype` UI work.
 * Delete along with whatever prototype mounted it.
 */
import { useEffect } from "react";

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
  names,
}: {
  variants: string[];
  current: string;
  onChange: (variant: string) => void;
  /** Optional variant key → short name, shown beside the key. */
  names?: Record<string, string>;
}) {
  const index = Math.max(0, variants.indexOf(current));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        onChange(variants[(index - 1 + variants.length) % variants.length]);
      } else if (e.key === "ArrowRight") {
        onChange(variants[(index + 1) % variants.length]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, variants, onChange]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-fuchsia-500 bg-black/90 px-2 py-1 text-white shadow-xl">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() =>
          onChange(variants[(index - 1 + variants.length) % variants.length])
        }
        className="rounded-full px-2 py-1 text-sm hover:bg-white/20"
      >
        ←
      </button>
      <span className="min-w-56 text-center font-mono text-xs">
        {current}
        {names?.[current] ? ` — ${names[current]}` : ""}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => onChange(variants[(index + 1) % variants.length])}
        className="rounded-full px-2 py-1 text-sm hover:bg-white/20"
      >
        →
      </button>
    </div>
  );
}
