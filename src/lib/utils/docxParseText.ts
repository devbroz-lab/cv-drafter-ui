/**
 * Extract plain text from WordprocessingML (OOXML) elements.
 * Table cells often contain multiple <w:p> paragraphs (e.g. GIZ project name
 * then description); joining them preserves the line breaks shown in Word.
 */

export const WP_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function wpChildren(el: Element, localName: string): Element[] {
  return Array.from(el.children).filter(
    (c) => c.nodeType === Node.ELEMENT_NODE && c.namespaceURI === WP_NS && c.localName === localName,
  );
}

/** Recursively collect all <w:t> text within a single element subtree. */
export function extractWordText(elem: Element): string {
  let text = "";
  for (const child of Array.from(elem.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (el.localName === "t") {
        text += el.textContent ?? "";
      } else {
        text += extractWordText(el);
      }
    }
  }
  return text;
}

/** Join each <w:p> in a table cell with newlines (matches Word line breaks). */
export function extractCellText(tc: Element): string {
  const paragraphs = wpChildren(tc, "p");
  if (paragraphs.length === 0) {
    return extractWordText(tc);
  }
  if (paragraphs.length === 1) {
    return extractWordText(paragraphs[0]);
  }
  return paragraphs
    .map((p) => extractWordText(p).trim())
    .filter((t) => t.length > 0)
    .join("\n");
}
