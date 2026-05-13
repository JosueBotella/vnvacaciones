export const LEGAL_A4_WIDTH = 793;
export const LEGAL_A4_HEIGHT = 1122;
export const LEGAL_FOOTER_HEIGHT = 72;
export const LEGAL_PAGE_CONTENT_HEIGHT = LEGAL_A4_HEIGHT - LEGAL_FOOTER_HEIGHT;

const LEGAL_FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;600&display=swap');";

const LEGAL_REMOTE_LOGO_URL = "https://vnprod.app/images/verdnatura-logo-green.png";
const LEGAL_REMOTE_SIGNATURE_URL = "https://vnprod.app/images/firma_juanvi.png";
const LEGAL_LOCAL_LOGO_URL = "/images/verdnatura-logo-green.png";
const LEGAL_LOCAL_SIGNATURE_URL = "/images/firma_juanvi.png";

function restoreAllowedInlineHtml(value: string): string {
  let normalized = String(value || "");

  for (let index = 0; index < 2; index += 1) {
    normalized = normalized
      .replace(/&amp;lt;(\/?strong)&amp;gt;/gi, "&lt;$1&gt;")
      .replace(/&amp;lt;br\s*\/?&amp;gt;/gi, "&lt;br&gt;");
  }

  return normalized
    .replace(/&lt;(\/?strong)&gt;/gi, "<$1>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

export const LEGAL_PAGE_BASE_CSS = `
${LEGAL_FONT_IMPORT}
.legal-page-shell,.legal-page-content,.legal-page-document,.legal-page-footer,.legal-page-footer-part{box-sizing:border-box}
.legal-page-shell{width:${LEGAL_A4_WIDTH}px;height:${LEGAL_A4_HEIGHT}px;background:#fff;display:flex;flex-direction:column;overflow:hidden}
.legal-page-content{height:${LEGAL_PAGE_CONTENT_HEIGHT}px;overflow:hidden;background:#fff}
.legal-page-document{min-height:100%;background:#fff}
.legal-page-document strong{font-weight:600!important}
.legal-page-footer{height:${LEGAL_FOOTER_HEIGHT}px;border-top:0.75px solid #e8e8e8;padding:8px 32px 14px;display:flex;align-items:stretch;gap:12px;overflow:hidden;background:#fff;font-family:'Poppins',system-ui,sans-serif;font-size:10px;line-height:1.22;font-weight:300;letter-spacing:0.01em;color:#aaa}
.legal-page-footer-part{flex:1;min-width:0;display:flex;align-items:center;white-space:nowrap;overflow-x:hidden;overflow-y:visible;text-overflow:ellipsis;padding-bottom:2px}
.legal-page-footer-part--center{justify-content:center;text-align:center}
.legal-page-footer-part--right{justify-content:flex-end;text-align:right}
.legal-page-document .badge,.legal-page-document .badge-inline{display:inline-grid!important;place-items:center!important;box-sizing:border-box!important;text-align:center!important;vertical-align:middle!important;white-space:nowrap!important;border-radius:999px!important}
.legal-page-document .badge{min-width:112px!important;height:30px!important;line-height:1.05!important;padding:0 16px 1px!important}
.legal-page-document .badge-inline{min-width:68px!important;height:24px!important;line-height:1.05!important;padding:0 12px 1px!important}
.legal-page-document .document-meta{display:flex!important;align-items:center!important;gap:10px!important;flex-wrap:wrap!important;margin-bottom:20px!important}
.legal-page-document .document-code{font-size:11px!important;color:#888!important;line-height:1.4!important;font-weight:300!important;letter-spacing:0.01em!important}
.legal-page-document .worker-info td{padding:6px 0!important;vertical-align:middle!important;line-height:1.4!important}
.legal-page-document .articulos,.legal-page-document .advertencias{padding:18px 18px!important;line-height:1.72!important;background-clip:padding-box!important}
.legal-page-document .firma-box{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:flex-start!important;min-width:0!important;text-align:center!important}
.legal-page-document .firma-box>*{margin-left:auto!important;margin-right:auto!important}
.legal-page-document .company-signature{max-width:360px!important;max-height:150px!important;margin:12px auto 4px!important;display:block!important;object-fit:contain!important}
.legal-page-document .firma-section--compact{gap:28px!important;margin-top:10px!important}
.legal-page-document .firma-section--compact .firma-box{padding-top:10px!important}
.legal-page-document .firma-section--compact .firma-box p{margin-top:2px!important;font-size:10px!important;line-height:1.35!important}
.legal-page-document .firma-section--compact .firma-label{font-size:9px!important;letter-spacing:0.03em!important}
.legal-page-document .firma-section--compact .company-signature{max-height:74px!important;margin:4px auto 0!important}
.legal-page-document .firma-section--ultra-compact{gap:20px!important;margin-top:6px!important}
.legal-page-document .firma-section--ultra-compact .firma-box{padding-top:4px!important}
.legal-page-document .firma-section--ultra-compact .firma-box p{margin-top:1px!important;margin-bottom:1px!important;font-size:9px!important;line-height:1.25!important}
.legal-page-document .firma-section--ultra-compact .firma-label{font-size:8px!important;letter-spacing:0.02em!important}
.legal-page-document .firma-section--ultra-compact .company-signature{max-height:54px!important;margin:2px auto 0!important}
`;

export interface LegalDocumentMeta {
  documentCode: string;
  tipoLabel: string;
  workerName: string;
  workerNumber: string;
  fecha: string;
}

export interface PaginatedLegalDocumentResult {
  meta: LegalDocumentMeta;
  pages: string[];
  scopedCss: string;
}

interface PaginateOptions extends Partial<LegalDocumentMeta> {}

export function normalizeLegalDocumentHtml(rawHtml: string): string {
  return restoreAllowedInlineHtml(String(rawHtml || ""))
    .split(LEGAL_REMOTE_LOGO_URL).join(LEGAL_LOCAL_LOGO_URL)
    .split(LEGAL_REMOTE_SIGNATURE_URL).join(LEGAL_LOCAL_SIGNATURE_URL)
    .replace(/\s+onerror=("[^"]*"|'[^']*')/gi, "")
    .replace(
      ".header-logo{width:44px;height:44px;object-fit:contain;flex-shrink:0}",
      ".header-logo{width:44px;height:44px;display:block;object-fit:contain;flex-shrink:0}"
    )
    .replace(
      ".header-left-text{display:flex;flex-direction:column;gap:1px}",
      ".header-left-text{display:flex;flex-direction:column;justify-content:center;min-height:44px;gap:2px}"
    )
    .replace(
      ".badge{display:inline-flex;align-items:center;white-space:nowrap;padding:4px 14px;border-radius:6px;font-size:11px;font-weight:600;letter-spacing:0em;color:#888;background:transparent;border:1.5px solid #ccc}",
      ".badge{display:inline-grid;place-items:center;box-sizing:border-box;white-space:nowrap;min-width:112px;height:30px;padding:0 16px 1px;border-radius:999px;font-size:11px;line-height:1.05;text-align:center;font-weight:600;letter-spacing:0;color:#888;background:transparent;border:1.5px solid #ccc;vertical-align:middle}"
    )
    .replace(
      ".badge-inline{display:inline-flex;align-items:center;white-space:nowrap;padding:3px 12px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:0em;color:#555;background:#f3f3f3;border:1px solid #d0d0d0;vertical-align:middle;flex-shrink:0}",
      ".badge-inline{display:inline-grid;place-items:center;box-sizing:border-box;white-space:nowrap;min-width:68px;min-height:24px;padding:0 12px 1px;border-radius:999px;font-size:10px;line-height:1.05;text-align:center;font-weight:600;letter-spacing:0;color:#555;background:#f3f3f3;border:1px solid #d0d0d0;vertical-align:middle}"
    )
    .replace(
      ".badge{display:inline-block;min-width:112px;padding:8px 14px 7px;border-radius:10px;font-size:11px;line-height:1;text-align:center;font-weight:600;letter-spacing:0;color:#888;background:transparent;border:1.5px solid #ccc;vertical-align:middle}",
      ".badge{display:inline-grid;place-items:center;box-sizing:border-box;white-space:nowrap;min-width:112px;height:30px;padding:0 16px 1px;border-radius:999px;font-size:11px;line-height:1.05;text-align:center;font-weight:600;letter-spacing:0;color:#888;background:transparent;border:1.5px solid #ccc;vertical-align:middle}"
    )
    .replace(
      ".badge-inline{display:inline-block;min-width:68px;padding:6px 12px 5px;border-radius:999px;font-size:10px;line-height:1;text-align:center;font-weight:600;letter-spacing:0;color:#555;background:#f3f3f3;border:1px solid #d0d0d0;vertical-align:middle}",
      ".badge-inline{display:inline-grid;place-items:center;box-sizing:border-box;white-space:nowrap;min-width:68px;min-height:24px;padding:0 12px 1px;border-radius:999px;font-size:10px;line-height:1.05;text-align:center;font-weight:600;letter-spacing:0;color:#555;background:#f3f3f3;border:1px solid #d0d0d0;vertical-align:middle}"
    );
}

function stripPrintMedia(css: string): string {
  return css.replace(/@media\s+print\s*\{[\s\S]*?\}\s*/gi, "");
}

function scopeLegalDocumentCss(css: string, scope = ".legal-page-document"): string {
  const strippedCss = stripPrintMedia(css);
  return strippedCss.replace(/(^|})\s*([^@}{][^{]*)\{/g, (match, boundary, selectorGroup) => {
    const selectors = selectorGroup
      .split(",")
      .map((selector: string) => selector.trim())
      .filter(Boolean)
      .map((selector: string) => {
        if (selector === "body" || selector === "html" || selector === ":root") return scope;
        if (selector === "*") return `${scope} *`;
        return `${scope} ${selector}`;
      })
      .join(", ");

    return `${boundary} ${selectors}{`;
  });
}

function isIgnorableNode(node: ChildNode): boolean {
  return node.nodeType === Node.TEXT_NODE && !node.textContent?.trim();
}

function isFooterNode(node: ChildNode): boolean {
  return node instanceof Element && node.classList.contains("doc-footer");
}

function isHeadingNode(node: ChildNode): node is HTMLElement {
  return node instanceof HTMLElement && node.tagName === "H2";
}

function isSignatureSectionNode(node: ChildNode): node is HTMLElement {
  return node instanceof HTMLElement && node.classList.contains("firma-section");
}

function cloneIntoDocument<T extends Node>(node: T, targetDocument: Document): T {
  return targetDocument.importNode(node, true) as T;
}

function createMeasureRoot(scopedCss: string) {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;left:-10000px;top:0;pointer-events:none;background:#fff;z-index:-1";

  const style = document.createElement("style");
  style.textContent = `${LEGAL_PAGE_BASE_CSS}\n${scopedCss}`;

  const shell = document.createElement("div");
  shell.className = "legal-page-shell";

  const content = document.createElement("div");
  content.className = "legal-page-content";

  const docRoot = document.createElement("div");
  docRoot.className = "legal-page-document";

  content.appendChild(docRoot);
  shell.appendChild(content);
  root.appendChild(style);
  root.appendChild(shell);
  document.body.appendChild(root);

  return { root, docRoot };
}

export async function waitForLegalDocumentAssets(root: ParentNode): Promise<void> {
  const ownerDocument = root instanceof Document ? root : root.ownerDocument;

  if (ownerDocument?.fonts) {
    try {
      await ownerDocument.fonts.ready;
    } catch {
      // ignore font timing issues
    }
  }

  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            })
    )
  );

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function buildPageHtml(nodes: ChildNode[]): string {
  const wrapper = document.createElement("div");
  nodes.forEach((node) => wrapper.appendChild(node.cloneNode(true)));
  return wrapper.innerHTML;
}

async function fitsOnPage(nodes: ChildNode[], measureDoc: HTMLElement): Promise<boolean> {
  measureDoc.replaceChildren(...nodes.map((node) => cloneIntoDocument(node, measureDoc.ownerDocument)));
  await waitForLegalDocumentAssets(measureDoc);
  return measureDoc.scrollHeight <= LEGAL_PAGE_CONTENT_HEIGHT + 1;
}

function buildCompactSignatureSection(node: HTMLElement): HTMLElement {
  const compact = node.cloneNode(true) as HTMLElement;
  compact.classList.add("firma-section--compact");

  compact.querySelectorAll<HTMLElement>(".firma-box > p[style]").forEach((paragraph) => {
    if (paragraph.style.marginBottom) {
      paragraph.style.marginBottom = paragraph.style.marginBottom === "8px" ? "4px" : "2px";
    }
  });

  const placeholder = compact.querySelector<HTMLElement>(".firma-box:last-child div[style*='height']");
  if (placeholder) {
    placeholder.style.height = "44px";
  }

  return compact;
}

function buildUltraCompactSignatureSection(node: HTMLElement): HTMLElement {
  const compact = node.cloneNode(true) as HTMLElement;
  compact.classList.add("firma-section--compact");
  compact.classList.add("firma-section--ultra-compact");

  compact.querySelectorAll<HTMLElement>(".firma-box > p[style]").forEach((paragraph) => {
    paragraph.style.marginTop = "1px";
    paragraph.style.marginBottom = "1px";
  });

  const placeholder = compact.querySelector<HTMLElement>(".firma-box:last-child div[style*='height']");
  if (placeholder) {
    placeholder.style.height = "30px";
  }

  return compact;
}

async function getCompactSignatureSectionThatFits(
  node: ChildNode,
  currentPageNodes: ChildNode[],
  measureDoc: HTMLElement,
): Promise<HTMLElement | null> {
  if (!isSignatureSectionNode(node) || currentPageNodes.length === 0) return null;

  const compactSignatureSection = buildCompactSignatureSection(node);
  if (await fitsOnPage([...currentPageNodes, compactSignatureSection], measureDoc)) {
    return compactSignatureSection;
  }

  const ultraCompactSignatureSection = buildUltraCompactSignatureSection(node);
  if (await fitsOnPage([...currentPageNodes, ultraCompactSignatureSection], measureDoc)) {
    return ultraCompactSignatureSection;
  }

  return null;
}

async function splitChildrenIntoFragments<T extends ChildNode>(
  items: T[],
  measureDoc: HTMLElement,
  buildFragment: (selectedItems: T[]) => HTMLElement,
): Promise<HTMLElement[]> {
  if (items.length <= 1) {
    return items.length === 1 ? [buildFragment(items)] : [];
  }

  const fragments: HTMLElement[] = [];
  let currentItems: T[] = [];

  for (const item of items) {
    const candidateItems = [...currentItems, item];
    const candidateFragment = buildFragment(candidateItems);

    if (await fitsOnPage([candidateFragment], measureDoc)) {
      currentItems = candidateItems;
      continue;
    }

    if (currentItems.length === 0) {
      return [candidateFragment];
    }

    fragments.push(buildFragment(currentItems));
    currentItems = [item];
  }

  if (currentItems.length > 0) {
    fragments.push(buildFragment(currentItems));
  }

  return fragments;
}

async function splitGenericElement(node: HTMLElement, measureDoc: HTMLElement): Promise<ChildNode[]> {
  const meaningfulChildren = Array.from(node.childNodes).filter((child) => !isIgnorableNode(child));
  if (meaningfulChildren.length <= 1) return [node];

  const fragments = await splitChildrenIntoFragments(meaningfulChildren, measureDoc, (selectedChildren) => {
    const fragment = node.cloneNode(false) as HTMLElement;
    selectedChildren.forEach((child) => fragment.appendChild(child.cloneNode(true)));
    return fragment;
  });

  return fragments.length > 1 ? fragments : [node];
}

async function splitEvidenceElement(node: HTMLElement, measureDoc: HTMLElement): Promise<ChildNode[]> {
  const children = Array.from(node.children);
  const titleElement = children.find((child) => child.tagName === "P") ?? null;
  const gridElement = children.find((child) => child.querySelector("figure")) ?? null;
  const figures = gridElement ? Array.from(gridElement.children).filter((child) => child.tagName === "FIGURE") : [];

  if (!gridElement || figures.length <= 1) return [node];

  const fragments = await splitChildrenIntoFragments(figures, measureDoc, (selectedFigures) => {
    const wrapper = node.cloneNode(false) as HTMLElement;
    if (titleElement) wrapper.appendChild(titleElement.cloneNode(true));

    const gridClone = gridElement.cloneNode(false) as HTMLElement;
    selectedFigures.forEach((figure) => gridClone.appendChild(figure.cloneNode(true)));
    wrapper.appendChild(gridClone);

    return wrapper;
  });

  return fragments.length > 1 ? fragments : [node];
}

async function splitNodeIntoBlocks(node: ChildNode, measureDoc: HTMLElement): Promise<ChildNode[]> {
  if (!(node instanceof HTMLElement)) return [node];

  if (node.classList.contains("section") || node.classList.contains("articulos") || node.classList.contains("advertencias")) {
    return splitGenericElement(node, measureDoc);
  }

  if (node.querySelectorAll("figure").length > 1) {
    return splitEvidenceElement(node, measureDoc);
  }

  if (node.children.length > 1) {
    return splitGenericElement(node, measureDoc);
  }

  return [node];
}

function extractMetaFromDocument(parsedDocument: Document, options: PaginateOptions): LegalDocumentMeta {
  const body = parsedDocument.body;

  return {
    documentCode: body.dataset.documentCode || options.documentCode || "",
    tipoLabel: body.dataset.tipo || options.tipoLabel || "",
    workerName: body.dataset.workerName || options.workerName || "",
    workerNumber: body.dataset.workerNumber || options.workerNumber || "",
    fecha: body.dataset.fecha || options.fecha || "",
  };
}

export async function paginateLegalDocument(rawHtml: string, options: PaginateOptions = {}): Promise<PaginatedLegalDocumentResult> {
  const normalizedHtml = normalizeLegalDocumentHtml(rawHtml || "");
  const parsedDocument = new DOMParser().parseFromString(normalizedHtml, "text/html");
  const scopedCss = scopeLegalDocumentCss(
    Array.from(parsedDocument.querySelectorAll("style"))
      .map((styleNode) => styleNode.textContent || "")
      .join("\n")
  );

  const meta = extractMetaFromDocument(parsedDocument, options);
  const blocks = Array.from(parsedDocument.body.childNodes).filter((node) => !isIgnorableNode(node) && !isFooterNode(node));

  if (blocks.length === 0) {
    return { meta, scopedCss, pages: [] };
  }

  const { root, docRoot } = createMeasureRoot(scopedCss);

  try {
    await waitForLegalDocumentAssets(root);

    const pages: string[] = [];
    const queue = [...blocks];
    let currentPageNodes: ChildNode[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const block = queue[index];
      const nextBlock = queue[index + 1];

      if (isHeadingNode(block) && nextBlock && currentPageNodes.length > 0) {
        const fitsHeadingWithNext = await fitsOnPage([...currentPageNodes, block, nextBlock], docRoot);
        if (!fitsHeadingWithNext) {
          pages.push(buildPageHtml(currentPageNodes));
          currentPageNodes = [];
        }
      }

      const candidatePageNodes = [...currentPageNodes, block];
      if (await fitsOnPage(candidatePageNodes, docRoot)) {
        currentPageNodes = candidatePageNodes;
        continue;
      }

      const compactSignatureSection = await getCompactSignatureSectionThatFits(block, currentPageNodes, docRoot);
      if (compactSignatureSection) {
        currentPageNodes = [...currentPageNodes, compactSignatureSection];
        continue;
      }

      if (currentPageNodes.length > 0) {
        pages.push(buildPageHtml(currentPageNodes));
        currentPageNodes = [];
        index -= 1;
        continue;
      }

      const splitBlocks = await splitNodeIntoBlocks(block, docRoot);
      if (splitBlocks.length > 1) {
        queue.splice(index, 1, ...splitBlocks);
        index -= 1;
        continue;
      }

      pages.push(buildPageHtml([block]));
    }

    if (currentPageNodes.length > 0) {
      pages.push(buildPageHtml(currentPageNodes));
    }

    return {
      meta,
      scopedCss,
      pages: pages.filter((page) => page.trim().length > 0),
    };
  } finally {
    root.remove();
  }
}

export function getLegalDocumentFooter(meta: LegalDocumentMeta, pageNumber: number, totalPages: number) {
  return {
    left: meta.documentCode || "",
    center: meta.workerName,
    right: `Página ${pageNumber} de ${totalPages}`,
  };
}
