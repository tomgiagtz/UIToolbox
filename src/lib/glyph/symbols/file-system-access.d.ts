/**
 * The sliver of the File System Access API that Symbol Set import uses (#39).
 *
 * TypeScript's DOM lib doesn't ship these: the API is Chromium-only, which is
 * exactly why the import path treats it as an enhancement and falls back to a
 * plain `<input type="file">` on Firefox and Safari. Declared here rather than
 * pulled from a package so the surface stays as small as what is actually
 * called — a handle we can re-read, and the picker that hands one over.
 */

interface FileSystemFileHandle {
  readonly kind: "file";
  readonly name: string;
  /** Re-read the file at the same path. Rejects once permission lapses. */
  getFile(): Promise<File>;
}

interface OpenFilePickerOptions {
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
  multiple?: boolean;
}

interface Window {
  /** Rejects when the user dismisses the picker, which is not an error. */
  showOpenFilePicker?: (
    options?: OpenFilePickerOptions,
  ) => Promise<FileSystemFileHandle[]>;
}
