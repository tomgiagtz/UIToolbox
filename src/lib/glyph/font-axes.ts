/**
 * Reading a font file's **weight axis**.
 *
 * A variable font has to be registered with an explicit `weight` descriptor
 * spanning its axis — `new FontFace(family, bytes, { weight: "100 900" })`.
 * Registered without one, the browser treats the face as a single 400 instance
 * and *synthesises* every other weight, so asking for 600 gets smeared fake
 * bold rather than the real SemiBold the file contains. Nothing reports that;
 * it just looks slightly wrong.
 *
 * So the range has to be known before the face is registered, and the only
 * place it exists is the file itself. This module reads it out of the `fvar`
 * table, which is also what tells an *uploaded* font apart from a static one —
 * the tool can't ask the user which kind they picked.
 *
 * Deliberately a reader, not a parser: it walks straight to the one table it
 * needs and gives up on anything it doesn't recognise, because the only two
 * answers it owes a caller are "here is the axis" and "there isn't one".
 */

/** The `wght` axis of a font file, as the file declares it. */
export interface WeightAxis {
  min: number;
  max: number;
  /** The instance drawn when nothing asks for a weight. */
  default: number;
}

/** Whether an axis offers a choice, i.e. the font is variable in weight. */
export function isVariableWeight(axis: WeightAxis): boolean {
  return axis.min < axis.max;
}

/** The axis a static font has: one weight, no choice. */
export function staticWeight(weight = 400): WeightAxis {
  return { min: weight, max: weight, default: weight };
}

// SFNT magic numbers. A bare font starts with one of the first three; a WOFF /
// WOFF2 wrapper starts with its own signature and compresses the tables, which
// is why those are declined rather than read.
const SFNT_VERSION_1 = 0x00010000;
const SFNT_TAG_OTTO = 0x4f54544f; // "OTTO" — CFF outlines
const SFNT_TAG_TRUE = 0x74727565; // "true" — legacy Apple TrueType
const TAG_FVAR = 0x66766172; // "fvar"
const TAG_WGHT = 0x77676874; // "wght"

/**
 * The weight axis declared by `data`, or `null` when it declares none — a static
 * font, a format this can't read (WOFF/WOFF2 compress their tables), or bytes
 * that aren't a font at all.
 *
 * `null` is not an error: the caller registers the face without a descriptor,
 * which is exactly right for a static font and the safest guess for anything
 * unreadable.
 */
export function readWeightAxis(data: ArrayBuffer): WeightAxis | null {
  try {
    return read(new DataView(data));
  } catch {
    // Any malformed offset lands here. A font whose table directory we can't
    // trust is one we register plainly, not one we refuse.
    return null;
  }
}

function read(view: DataView): WeightAxis | null {
  const version = view.getUint32(0);
  if (
    version !== SFNT_VERSION_1 &&
    version !== SFNT_TAG_OTTO &&
    version !== SFNT_TAG_TRUE
  ) {
    // A collection would need picking a face out of it, and a WOFF would need
    // decompressing; neither is worth carrying for a weight range.
    return null;
  }

  const fvar = findTable(view, TAG_FVAR);
  if (fvar === null) return null;

  // fvar header: majorVersion, minorVersion, axesArrayOffset, reserved,
  // axisCount, axisSize, instanceCount, instanceSize.
  const axesOffset = fvar + view.getUint16(fvar + 4);
  const axisCount = view.getUint16(fvar + 8);
  const axisSize = view.getUint16(fvar + 10);

  for (let i = 0; i < axisCount; i++) {
    const axis = axesOffset + i * axisSize;
    if (view.getUint32(axis) !== TAG_WGHT) continue;
    // Each axis record is tag, then min/default/max as 16.16 fixed-point.
    return {
      min: fixed1616(view, axis + 4),
      default: fixed1616(view, axis + 8),
      max: fixed1616(view, axis + 12),
    };
  }
  return null;
}

/** Byte offset of `tag` in the table directory, or `null` if it isn't there. */
function findTable(view: DataView, tag: number): number | null {
  const numTables = view.getUint16(4);
  // The directory follows the 12-byte header, 16 bytes per record: tag,
  // checksum, offset, length.
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (view.getUint32(record) === tag) return view.getUint32(record + 8);
  }
  return null;
}

/** Read a 16.16 fixed-point number, the format fvar states its axis bounds in. */
function fixed1616(view: DataView, offset: number): number {
  return view.getInt32(offset) / 65536;
}
