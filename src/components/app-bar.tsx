import type { ReactNode } from "react";

/**
 * The fixed top bar shared by every page: content pinned to the left (brand or a
 * back link) with an optional centered title that stays centered across the full
 * bar width regardless of how wide the left content is.
 */
export function AppBar({
  left,
  center,
}: {
  left?: ReactNode;
  center?: ReactNode;
}) {
  return (
    <header className="relative flex h-14 shrink-0 items-center border-b px-6">
      <div className="z-10">{left}</div>
      {center ? (
        <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center">
          {center}
        </div>
      ) : null}
    </header>
  );
}
