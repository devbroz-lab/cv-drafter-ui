import { describe, expect, it } from "vitest";

import { extractCellText, extractWordText, WP_NS } from "./docxParseText";

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "text/xml");
}

function tcFromCellXml(inner: string): Element {
  const doc = parseXml(
    `<w:tc xmlns:w="${WP_NS}">${inner}</w:tc>`,
  );
  return doc.documentElement;
}

describe("extractCellText", () => {
  it("joins multiple paragraphs with a newline", () => {
    const tc = tcFromCellXml(`
      <w:p><w:r><w:t>Modelling of the Continental Power System Masterplan</w:t></w:r></w:p>
      <w:p><w:r><w:t>Modelling and planning studies for the 2nd phase</w:t></w:r></w:p>
    `);
    expect(extractCellText(tc)).toBe(
      "Modelling of the Continental Power System Masterplan\nModelling and planning studies for the 2nd phase",
    );
  });

  it("returns single-paragraph text unchanged", () => {
    const tc = tcFromCellXml(`<w:p><w:r><w:t>Single line</w:t></w:r></w:p>`);
    expect(extractCellText(tc)).toBe("Single line");
  });
});

describe("extractWordText", () => {
  it("concatenates runs within one paragraph", () => {
    const doc = parseXml(`<w:p xmlns:w="${WP_NS}"><w:r><w:t>Hello </w:t></w:r><w:r><w:t>world</w:t></w:r></w:p>`);
    expect(extractWordText(doc.documentElement)).toBe("Hello world");
  });
});
