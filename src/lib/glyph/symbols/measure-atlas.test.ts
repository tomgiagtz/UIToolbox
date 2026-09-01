/**
 * `measureAtlas` needs real layout, which jsdom has none of — so what is covered
 * here is the half that doesn't: *which* elements an atlas offers up as
 * candidates. That is where the shipped atlases were being missed entirely (#39
 * follow-up), and it is answerable from the tree alone.
 */
import { describe, expect, it } from "vitest";
import { candidateElements } from "./measure-atlas";

/**
 * The shape every atlas is actually exported in: a frame rect and a `<clipPath>`
 * at the top, and the art one level down inside an **unnamed** clip group.
 */
function atlas(): Element {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048">
       <rect id="xbox-symbols" width="2048" height="2048" style="fill:none;"/>
       <clipPath id="_clip1"><rect width="2048" height="2048"/></clipPath>
       <g clip-path="url(#_clip1)">
         <path id="xbox-a" d="M0,0"/>
         <g id="dpad-right"><path id="DPad_Right" d="M0,0"/></g>
       </g>
     </svg>`,
    "image/svg+xml",
  );
  return doc.querySelector("svg")!;
}

const idsOf = (root: Element) =>
  candidateElements(root).map((el) => el.getAttribute("id"));

describe("which elements an atlas offers as candidates", () => {
  it("finds the cells inside the export's unnamed clip group", () => {
    // The bug this replaces: `:scope > [id]` saw the frame and nothing else.
    expect(idsOf(atlas())).toContain("xbox-a");
  });

  it("takes a group over the parts inside it, so one cell can't rival itself", () => {
    const ids = idsOf(atlas());
    expect(ids).toContain("dpad-right");
    expect(ids).not.toContain("DPad_Right");
  });

  it("passes the frame rect through, since only measuring can judge it", () => {
    // Too big for a grid square is `windowCell`'s call to explain, not this one's.
    expect(idsOf(atlas())).toContain("xbox-symbols");
  });

  it("never offers a <clipPath>, which is named but drawn by nothing", () => {
    expect(idsOf(atlas())).not.toContain("_clip1");
  });
});
