/**
 * Legal Document Block Editor — utilities
 *
 * Operates on the body-level blocks of a legal document HTML.
 * A "block" = one direct child of <body> that is meaningful (not whitespace,
 * not the doc-footer). We tag each block with data-block-id for stable
 * identification across reorders, and persist layout tweaks via data-block-*
 * attributes interpreted by an injected stylesheet.
 */

const BLOCK_STYLE_MARKER = "legal-block-editor-styles";

export const BLOCK_STYLE_CSS = `
/* Layout overrides driven by data-block-* attributes (manual block editor) */
[data-block-margin-top="none"]{margin-top:0!important}
[data-block-margin-top="xs"]{margin-top:4px!important}
[data-block-margin-top="sm"]{margin-top:8px!important}
[data-block-margin-top="md"]{margin-top:16px!important}
[data-block-margin-top="lg"]{margin-top:28px!important}
[data-block-margin-bottom="none"]{margin-bottom:0!important}
[data-block-margin-bottom="xs"]{margin-bottom:4px!important}
[data-block-margin-bottom="sm"]{margin-bottom:8px!important}
[data-block-margin-bottom="md"]{margin-bottom:16px!important}
[data-block-margin-bottom="lg"]{margin-bottom:28px!important}
[data-block-size="compact"]{padding:8px 12px!important;font-size:0.92em!important;line-height:1.5!important}
[data-block-size="amplio"]{padding:24px!important;line-height:1.85!important}
[data-block-size="compact"] .firma-box,[data-block-size="compact"] .firma-section{gap:18px!important}
[data-block-size="compact"] .company-signature{max-height:64px!important}
[data-block-size="compact"] p{margin-top:4px!important;margin-bottom:4px!important}
/* Auto-fit for figures grid when images have been removed manually */
[data-figures-edited="1"]{gap:12px!important}
[data-figures-edited="1"] figure{margin:0!important;width:auto!important;max-width:100%!important;flex:1 1 auto!important}
[data-figures-edited="1"] figure img{width:100%!important;height:auto!important;max-height:280px!important;object-fit:cover!important}
`;

export type BlockSize = "default" | "compact" | "amplio";
export type BlockMargin = "default" | "none" | "xs" | "sm" | "md" | "lg";

export interface FigureMeta {
  id: string;
  caption: string;
  src: string;
}

/** Inline style overrides set by the live block editor. */
export interface BlockInlineStyle {
  /** px; null = use default (no override) */
  marginTop: number | null;
  marginBottom: number | null;
  paddingY: number | null;
  /** px; if set, overrides padding-left/right */
  paddingX: number | null;
  /** font-size as a percentage of the inherited size, e.g. 0.85 = 85% */
  scale: number | null;
}

export interface BlockMeta {
  id: string;
  label: string;
  className: string;
  marginTop: BlockMargin;
  marginBottom: BlockMargin;
  size: BlockSize;
  inline: BlockInlineStyle;
  preview: string;
  figures: FigureMeta[];
}

interface ParsedDocument {
  doc: Document;
  blocks: HTMLElement[];
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export function parseLegalDocument(rawHtml: string): ParsedDocument {
  const doc = new DOMParser().parseFromString(rawHtml || "", "text/html");
  ensureBlockStyleTag(doc);

  const candidates = Array.from(doc.body.children) as HTMLElement[];
  const blocks = candidates.filter((node) => isMeaningfulBlock(node));

  blocks.forEach((node, index) => {
    if (!node.getAttribute("data-block-id")) {
      node.setAttribute("data-block-id", makeBlockId(node, index));
    }
    const figs = Array.from(node.querySelectorAll("figure")) as HTMLElement[];
    figs.forEach((f, i) => {
      if (!f.getAttribute("data-figure-id")) {
        f.setAttribute("data-figure-id", makeFigureId(f, i));
      }
    });
  });

  return { doc, blocks };
}

function isMeaningfulBlock(node: Element): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node.classList.contains("doc-footer")) return false;
  if (node.classList.contains("footer")) return false;
  if (node.tagName === "STYLE" || node.tagName === "SCRIPT") return false;
  if (!node.textContent?.trim() && !node.querySelector("img,figure,table")) return false;
  return true;
}

function makeBlockId(node: HTMLElement, index: number): string {
  const cls = (node.className || "").split(/\s+/).filter(Boolean).slice(0, 2).join("-") || node.tagName.toLowerCase();
  const seed = `${cls}|${(node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48)}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const suffix = seed.length < 8 ? `-${index}` : "";
  return `blk-${(hash >>> 0).toString(36)}${suffix}`;
}

function makeFigureId(node: HTMLElement, index: number): string {
  const img = node.querySelector("img");
  const src = img?.getAttribute("src") || "";
  const cap = node.querySelector("figcaption")?.textContent?.trim() || "";
  const seed = `${src.slice(-80)}|${cap.slice(0, 40)}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return `fig-${(hash >>> 0).toString(36)}-${index}`;
}

function ensureBlockStyleTag(doc: Document) {
  const existing = doc.head?.querySelector(`style[data-marker="${BLOCK_STYLE_MARKER}"]`);
  if (existing) {
    existing.textContent = BLOCK_STYLE_CSS;
    return;
  }
  const style = doc.createElement("style");
  style.setAttribute("data-marker", BLOCK_STYLE_MARKER);
  style.textContent = BLOCK_STYLE_CSS;
  if (doc.head) doc.head.appendChild(style);
  else doc.documentElement.insertBefore(style, doc.body);
}

/* ------------------------------------------------------------------ */
/* Meta extraction                                                     */
/* ------------------------------------------------------------------ */

const KNOWN_LABELS: Array<[string, string]> = [
  ["document-meta", "Cabecera"],
  ["worker-info", "Datos del trabajador"],
  ["firma-section", "Firmas"],
  ["testigos-section", "Testigos"],
  ["evidencias-graficas", "Evidencias gráficas"],
  ["articulos", "Artículos del convenio"],
  ["advertencias", "Advertencias legales"],
  ["medida", "Medida disciplinaria"],
  ["hechos", "Exposición de hechos"],
];

export function getBlockLabel(node: HTMLElement): string {
  for (const [cls, label] of KNOWN_LABELS) {
    if (node.classList.contains(cls)) return label;
  }
  const heading = node.querySelector("h2,h3");
  if (heading?.textContent) return heading.textContent.trim().replace(/\s+/g, " ").slice(0, 60);
  if (node.classList.contains("section")) return "Sección";
  if (node.querySelector("figure")) return "Bloque con imágenes";
  if (node.tagName === "TABLE") return "Tabla";
  return node.tagName.toLowerCase();
}

function readMargin(node: HTMLElement, attr: string): BlockMargin {
  const value = (node.getAttribute(attr) || "").toLowerCase();
  if (value === "none" || value === "xs" || value === "sm" || value === "md" || value === "lg") return value;
  return "default";
}

function readSize(node: HTMLElement): BlockSize {
  const value = (node.getAttribute("data-block-size") || "").toLowerCase();
  if (value === "compact" || value === "amplio") return value;
  return "default";
}

export function extractFiguresMeta(node: HTMLElement): FigureMeta[] {
  const figs = Array.from(node.querySelectorAll("figure")) as HTMLElement[];
  return figs.map((f, i) => {
    const img = f.querySelector("img");
    const cap = f.querySelector("figcaption")?.textContent?.trim() || "";
    return {
      id: f.getAttribute("data-figure-id") || `fig-${i}`,
      caption: cap,
      src: img?.getAttribute("src") || "",
    };
  });
}

function readInlineStyle(node: HTMLElement): BlockInlineStyle {
  const parsePx = (v: string | null): number | null => {
    if (!v) return null;
    const m = /(-?[\d.]+)\s*px/.exec(v);
    return m ? Number(m[1]) : null;
  };
  let scale: number | null = null;
  const sAttr = node.getAttribute("data-lbe-scale");
  if (sAttr) {
    const n = Number(sAttr);
    if (Number.isFinite(n) && n > 0) scale = n;
  }
  const padTop = parsePx(node.style.paddingTop);
  const padBot = parsePx(node.style.paddingBottom);
  const padLeft = parsePx(node.style.paddingLeft);
  const padRight = parsePx(node.style.paddingRight);
  return {
    marginTop: parsePx(node.style.marginTop),
    marginBottom: parsePx(node.style.marginBottom),
    paddingY: padTop != null && padTop === padBot ? padTop : null,
    paddingX: padLeft != null && padLeft === padRight ? padLeft : null,
    scale,
  };
}

export function extractBlocksMeta(blocks: HTMLElement[]): BlockMeta[] {
  return blocks.map((node) => ({
    id: node.getAttribute("data-block-id") || "",
    label: getBlockLabel(node),
    className: node.className || "",
    marginTop: readMargin(node, "data-block-margin-top"),
    marginBottom: readMargin(node, "data-block-margin-bottom"),
    size: readSize(node),
    inline: readInlineStyle(node),
    preview: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90),
    figures: extractFiguresMeta(node),
  }));
}

export function getBlockMeta(doc: Document, blockId: string): BlockMeta | null {
  const node = doc.body.querySelector<HTMLElement>(`[data-block-id="${cssEscape(blockId)}"]`);
  if (!node) return null;
  return extractBlocksMeta([node])[0] || null;
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export function reorderBlocks(doc: Document, orderedIds: string[]): void {
  const body = doc.body;
  const map = new Map<string, HTMLElement>();
  Array.from(body.children).forEach((child) => {
    if (child instanceof HTMLElement) {
      const id = child.getAttribute("data-block-id");
      if (id) map.set(id, child);
    }
  });

  const fragment = doc.createDocumentFragment();
  const placeholder = doc.createComment("legal-blocks-placeholder");

  let inserted = false;
  Array.from(body.childNodes).forEach((node) => {
    if (node instanceof HTMLElement && map.has(node.getAttribute("data-block-id") || "")) {
      if (!inserted) {
        body.insertBefore(placeholder, node);
        inserted = true;
      }
      body.removeChild(node);
    }
  });

  orderedIds.forEach((id) => {
    const el = map.get(id);
    if (el) fragment.appendChild(el);
  });

  if (placeholder.parentNode) {
    placeholder.parentNode.insertBefore(fragment, placeholder);
    placeholder.parentNode.removeChild(placeholder);
  } else {
    body.appendChild(fragment);
  }
}

export function setBlockAttribute(
  doc: Document,
  blockId: string,
  attr: "data-block-margin-top" | "data-block-margin-bottom" | "data-block-size",
  value: BlockMargin | BlockSize,
): void {
  const node = doc.body.querySelector<HTMLElement>(`[data-block-id="${cssEscape(blockId)}"]`);
  if (!node) return;
  if (value === "default") node.removeAttribute(attr);
  else node.setAttribute(attr, value);
}

/** Move a block one position up or down in the body order. Returns true if moved. */
export function moveBlockBy(doc: Document, blockId: string, delta: -1 | 1): boolean {
  const blocks = Array.from(doc.body.children).filter(
    (n): n is HTMLElement => n instanceof HTMLElement && !!n.getAttribute("data-block-id"),
  );
  const idx = blocks.findIndex((n) => n.getAttribute("data-block-id") === blockId);
  if (idx < 0) return false;
  const target = idx + delta;
  if (target < 0 || target >= blocks.length) return false;
  const ids = blocks.map((n) => n.getAttribute("data-block-id") || "");
  [ids[idx], ids[target]] = [ids[target], ids[idx]];
  reorderBlocks(doc, ids);
  return true;
}

/** Whether a block can move up/down in the current body order. */
export function getBlockMovability(doc: Document, blockId: string): { canUp: boolean; canDown: boolean } {
  const blocks = Array.from(doc.body.children).filter(
    (n): n is HTMLElement => n instanceof HTMLElement && !!n.getAttribute("data-block-id"),
  );
  const idx = blocks.findIndex((n) => n.getAttribute("data-block-id") === blockId);
  if (idx < 0) return { canUp: false, canDown: false };
  return { canUp: idx > 0, canDown: idx < blocks.length - 1 };
}


export type BlockInlineStylePatch = Partial<BlockInlineStyle>;

/** Applies inline style overrides to the working DOM. Pass `null` to clear an override. */
export function setBlockInlineStyle(
  doc: Document,
  blockId: string,
  patch: BlockInlineStylePatch,
): BlockInlineStyle | null {
  const node = doc.body.querySelector<HTMLElement>(`[data-block-id="${cssEscape(blockId)}"]`);
  if (!node) return null;
  if ("marginTop" in patch) {
    if (patch.marginTop == null) node.style.removeProperty("margin-top");
    else node.style.marginTop = `${patch.marginTop}px`;
  }
  if ("marginBottom" in patch) {
    if (patch.marginBottom == null) node.style.removeProperty("margin-bottom");
    else node.style.marginBottom = `${patch.marginBottom}px`;
  }
  if ("paddingY" in patch) {
    if (patch.paddingY == null) {
      node.style.removeProperty("padding-top");
      node.style.removeProperty("padding-bottom");
    } else {
      node.style.paddingTop = `${patch.paddingY}px`;
      node.style.paddingBottom = `${patch.paddingY}px`;
    }
  }
  if ("paddingX" in patch) {
    if (patch.paddingX == null) {
      node.style.removeProperty("padding-left");
      node.style.removeProperty("padding-right");
    } else {
      node.style.paddingLeft = `${patch.paddingX}px`;
      node.style.paddingRight = `${patch.paddingX}px`;
    }
  }
  if ("scale" in patch) {
    node.style.removeProperty("font-size");
    setBlockScaleStyle(doc, blockId, patch.scale ?? null);
    if (patch.scale == null) node.removeAttribute("data-lbe-scale");
    else node.setAttribute("data-lbe-scale", String(patch.scale));
  }
  return readInlineStyle(node);
}

function setBlockScaleStyle(doc: Document, blockId: string, scale: number | null): void {
  const id = `lbe-scale-${blockId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  let tag = doc.head?.querySelector<HTMLStyleElement>(`style[data-lbe-scale-id="${id}"]`);
  if (scale == null) {
    if (tag) tag.remove();
    return;
  }
  const sel = `[data-block-id="${blockId.replace(/"/g, '\\"')}"]`;
  const css = `${sel}{font-size:${(12.5 * scale).toFixed(2)}px !important;line-height:1.55 !important;}` +
    `${sel} *:not(h2):not(h3){font-size:inherit !important;}` +
    `${sel} h2{font-size:${(14.5 * scale).toFixed(2)}px !important;}` +
    `${sel} h3{font-size:${(13 * scale).toFixed(2)}px !important;}`;
  if (!tag) {
    tag = doc.createElement("style");
    tag.setAttribute("data-lbe-scale-id", id);
    doc.head?.appendChild(tag);
  }
  tag.textContent = css;
}

export function resetBlock(doc: Document, blockId: string): void {
  const node = doc.body.querySelector<HTMLElement>(`[data-block-id="${cssEscape(blockId)}"]`);
  if (!node) return;
  node.removeAttribute("data-block-margin-top");
  node.removeAttribute("data-block-margin-bottom");
  node.removeAttribute("data-block-size");
  node.removeAttribute("data-lbe-scale");
  node.style.removeProperty("margin-top");
  node.style.removeProperty("margin-bottom");
  node.style.removeProperty("padding-top");
  node.style.removeProperty("padding-bottom");
  node.style.removeProperty("padding-left");
  node.style.removeProperty("padding-right");
  node.style.removeProperty("font-size");
  setBlockScaleStyle(doc, blockId, null);
}

export function removeBlock(doc: Document, blockId: string): void {
  const node = doc.body.querySelector<HTMLElement>(`[data-block-id="${cssEscape(blockId)}"]`);
  if (node) node.remove();
}

/**
 * Find the immediate visual container of <figure> elements within a block.
 * Walks down from block looking for the deepest element whose direct children
 * include <figure> nodes (the actual grid/flex container).
 */
function findFigureContainer(block: HTMLElement, fig: HTMLElement): HTMLElement {
  return (fig.parentElement && block.contains(fig.parentElement)) ? fig.parentElement : block;
}

function rebalanceFigureGrid(container: HTMLElement) {
  const figs = Array.from(container.querySelectorAll(":scope > figure")) as HTMLElement[];
  const count = figs.length;
  container.setAttribute("data-figures-edited", "1");
  // Always switch to a flex/grid layout that fills the available width.
  container.style.display = count <= 0 ? "" : "grid";
  container.style.gap = "12px";
  if (count === 0) {
    container.style.gridTemplateColumns = "";
  } else if (count === 1) {
    container.style.gridTemplateColumns = "1fr";
  } else if (count === 2) {
    container.style.gridTemplateColumns = "1fr 1fr";
  } else {
    container.style.gridTemplateColumns = "repeat(auto-fit, minmax(220px, 1fr))";
  }
  // Strip per-figure widths the backend may have set.
  figs.forEach((f) => {
    f.style.width = "";
    f.style.maxWidth = "";
    f.style.flex = "";
    const img = f.querySelector("img") as HTMLImageElement | null;
    if (img) {
      img.style.width = "100%";
      img.style.height = "auto";
    }
  });
}

export function removeFigure(doc: Document, blockId: string, figureId: string): void {
  const block = doc.body.querySelector<HTMLElement>(`[data-block-id="${cssEscape(blockId)}"]`);
  if (!block) return;
  const fig = block.querySelector<HTMLElement>(`figure[data-figure-id="${cssEscape(figureId)}"]`);
  if (!fig) return;
  const container = findFigureContainer(block, fig);
  fig.remove();
  rebalanceFigureGrid(container);
  block.setAttribute("data-block-figures-edited", "1");
}

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */

export function serializeDocument(doc: Document): string {
  const html = doc.documentElement?.outerHTML || "";
  return html.startsWith("<!DOCTYPE") ? html : `<!DOCTYPE html>\n${html}`;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function cssEscape(value: string): string {
  if (typeof (window as any)?.CSS?.escape === "function") {
    return (window as any).CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
