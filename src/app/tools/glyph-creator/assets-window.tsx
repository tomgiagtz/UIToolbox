"use client";

import { useId, type Dispatch } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { Button } from "@/components/ui/button";
import { pickableFonts } from "@/lib/glyph/fonts";
import { unusedImages, usedImageIds } from "@/lib/glyph/image-refs";
import type { ProjectAction } from "@/lib/glyph/project";
import type { ImageAsset, Project } from "@/lib/glyph/types";
import { AssetArt } from "./asset-art";
import { ConfirmButton } from "./confirm-button";
import { FONT_ACCEPT, IMAGE_ACCEPT, UploadField } from "./upload-field";

/**
 * The **Assets window**: where the project's art is *had* (ADR-0014).
 *
 * It answers "what does this project have?" — upload, remove, and (later)
 * import a Symbol Set. It never answers "what does this Glyph draw?", which is
 * the Style panel's job, so it deliberately knows nothing about `StyleScope`.
 * The two want opposite groupings — management by Asset **kind**, picking by
 * **role** — and one surface serving both would have to be organised two ways at
 * once.
 *
 * Its own `<dialog>` rather than the shared {@link Modal}: that shell is a
 * *form* dialog wrapping `method="dialog"` — open, choose, submit, gone — which
 * is exactly Save and Export. This window has no submit and each action takes
 * effect immediately, so sharing would mean growing `Modal` a size flag, an
 * optional form, and eventually the `dismissible: false` that #81 wants, until
 * two callers shared a name and nothing else.
 */
export function AssetsWindow({
  ref,
  project,
  dispatch,
  onUploadImage,
  onUploadFont,
  onRemoveImages,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  project: Project;
  dispatch: Dispatch<ProjectAction>;
  onUploadImage: (file: File) => Promise<ImageAsset>;
  onUploadFont: (file: File) => Promise<{ family: string }>;
  /** Forget the bytes behind ids the reducer has just dropped from the manifest. */
  onRemoveImages: (ids: string[]) => void;
}) {
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto h-[80vh] max-h-[80vh] w-[min(56rem,90vw)] rounded-lg border bg-surface-base p-0 text-foreground backdrop:bg-black/40"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            Assets
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => ref.current?.close()}
          >
            Close
          </Button>
        </div>

        <Tabs className="flex min-h-0 flex-1 flex-col">
          <TabList
            aria-label="Asset kinds"
            className="flex gap-1 border-b px-5 pt-3"
          >
            <AssetTab id="images">Images</AssetTab>
            <AssetTab id="fonts">Fonts</AssetTab>
            <AssetTab id="sets">Symbol Sets</AssetTab>
          </TabList>

          <TabPanel id="images" className="min-h-0 flex-1 overflow-y-auto p-5">
            <ImagesSection
              project={project}
              dispatch={dispatch}
              onUploadImage={onUploadImage}
              onRemoveImages={onRemoveImages}
            />
          </TabPanel>
          <TabPanel id="fonts" className="min-h-0 flex-1 overflow-y-auto p-5">
            <FontsSection project={project} onUploadFont={onUploadFont} />
          </TabPanel>
          <TabPanel id="sets" className="min-h-0 flex-1 overflow-y-auto p-5">
            <SetsSection />
          </TabPanel>
        </Tabs>
      </div>
    </dialog>
  );
}

function AssetTab({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Tab
      id={id}
      className={({ isSelected, isFocusVisible }) =>
        [
          "cursor-pointer rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium outline-none",
          isSelected
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
          isFocusVisible ? "ring-2 ring-ring" : "",
        ].join(" ")
      }
    >
      {children}
    </Tab>
  );
}

/**
 * The project's uploaded **custom images** (#62).
 *
 * Each row reads **Used** or **Unused** and no more. A count of affected Glyphs
 * would mean two different things depending on the tier holding the reference —
 * an image on the Project base is used by every Glyph that does not override it,
 * and counting those means resolving the whole cascade for every Input on every
 * Device.
 */
function ImagesSection({
  project,
  dispatch,
  onUploadImage,
  onRemoveImages,
}: {
  project: Project;
  dispatch: Dispatch<ProjectAction>;
  onUploadImage: (file: File) => Promise<ImageAsset>;
  onRemoveImages: (ids: string[]) => void;
}) {
  const used = usedImageIds(project);
  // Computed here as well as in the reducer: the button needs the count, and the
  // bytes need the ids. `sweep-unused-images` recomputes rather than taking this
  // list, so the config side cannot be talked into dropping a referenced row.
  const unused = unusedImages(project);

  function remove(ids: string[], action: ProjectAction) {
    dispatch(action);
    onRemoveImages(ids);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Images you upload can be a Glyph&rsquo;s Render Source or a
          Background&rsquo;s tile. Removing one makes every Glyph using it fall
          back.
        </p>
        {unused.length > 0 && (
          <ConfirmButton
            label={`Remove unused (${unused.length})`}
            onConfirm={() =>
              remove(
                unused.map((image) => image.id),
                { type: "sweep-unused-images" },
              )
            }
          />
        )}
      </div>

      {project.images.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No images uploaded yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {project.images.map((image) => (
            <li
              key={image.id}
              className="flex items-center gap-3 rounded-md border p-2"
            >
              <AssetArt
                spec={{ kind: "image", id: image.id }}
                className="size-10 shrink-0 object-contain"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {image.fileName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {used.has(image.id) ? "Used" : "Unused"}
              </span>
              <ConfirmButton
                label="Remove"
                name={`Remove ${image.fileName}`}
                onConfirm={() =>
                  remove([image.id], {
                    type: "remove-image",
                    imageId: image.id,
                  })
                }
                className="shrink-0"
              />
            </li>
          ))}
        </ul>
      )}

      <UploadField
        label="Upload an image"
        accept={IMAGE_ACCEPT}
        hint="PNG, JPEG, WebP, or SVG. Uploads stay in your browser. It joins the project and can then be picked in the Style panel."
        onUpload={(file) => void onUploadImage(file)}
      />
    </div>
  );
}

/**
 * The project's **Fonts** — bundled families beside its uploads.
 *
 * Upload only. A font is an Asset with the same one-way manifest an image had,
 * and removing one is filed rather than built (ADR-0014).
 */
function FontsSection({
  project,
  onUploadFont,
}: {
  project: Project;
  onUploadFont: (file: File) => Promise<{ family: string }>;
}) {
  const fonts = pickableFonts(project);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Bundled families ship with the tool and never travel in a save. Uploads
        are carried in the project file.
      </p>
      <ul className="flex flex-col gap-2">
        {fonts.map((font) => (
          <li
            key={font.family}
            className="flex items-center gap-3 rounded-md border p-2"
          >
            <span
              className="min-w-0 flex-1 truncate text-sm"
              style={{ fontFamily: font.family }}
            >
              {font.label}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {font.bundled ? "Bundled" : "Uploaded"}
            </span>
          </li>
        ))}
      </ul>

      {/* A rejection already shows as a status message in the editor, so it is
          swallowed here rather than left unhandled. */}
      <UploadField
        label="Upload a font"
        accept={FONT_ACCEPT}
        hint="TTF, OTF, WOFF, or WOFF2. Uploads stay in your browser."
        onUpload={(file) => void onUploadFont(file).catch(() => undefined)}
      />
    </div>
  );
}

/**
 * **Symbol Sets** — the home ADR-0007 §5 asked for, standing empty until #39
 * fills it with import, cell-mapping review, and per-set default role colours.
 *
 * Present rather than hidden because the section model is the decision
 * (ADR-0014 §3): a Set is the shipment that carries Symbols and Authored
 * Backgrounds, and this is where acquiring one will happen.
 */
function SetsSection() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A Symbol Set is one SVG whose cells are the Symbols and Authored
        Backgrounds you can draw with. Every Set currently ships with the tool
        and is compiled in at build time.
      </p>
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Importing and configuring your own Sets isn&rsquo;t built yet.
      </p>
    </div>
  );
}
