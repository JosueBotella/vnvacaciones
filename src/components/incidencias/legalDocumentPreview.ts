import { sanitizeHtml } from "@/lib/sanitize";

import {
  LEGAL_A4_WIDTH,
  LEGAL_PAGE_BASE_CSS,
  getLegalDocumentFooter,
  type PaginatedLegalDocumentResult,
} from "./legalDocumentPagination";

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface BuildPreviewOptions {
  /** Inject script that posts text selections to parent window. */
  enableSelection?: boolean;
  /** Make body contenteditable for manual edit mode. */
  editable?: boolean;
   /**
    * Enable drag-to-reposition on evidence images. Updates each `<img>`'s inline
    * crop state (`object-position` + `transform`) and notifies the parent on change.
    */
  imageReposition?: boolean;
  /**
   * Enable in-document block editing: hover handles, click-to-select with
   * floating popover (rendered by the parent), drag-to-reorder and per-figure
   * trash buttons.
   */
  blockEditing?: boolean;
  /**
   * Font-size delta in px applied to body text selectors (live preview tweak).
   * 0 = use the document's original sizes. Positive = bigger, negative = smaller.
   */
  fontDelta?: number;
}

/**
 * Base font sizes (px) used by the legal document templates in the
 * incidencias-operations edge function. Kept in sync so the live preview
 * tweak yields the same proportional hierarchy as the generated HTML.
 */
const FONT_SCALE_BASE: Record<string, number> = {
  body: 12.5,
  ".section": 12.5,
  ".justificacion": 12.5,
  ".hechos": 12.5,
  ".advertencia": 12.5,
  ".plazo": 12.5,
  ".worker-info": 12.5,
  ".worker-id-card": 12.5,
  ".worker-id-card .value": 12.5,
  ".worker-id-card .label": 11,
  ".worker-id-extra": 12.5,
  ".worker-id-extra .value": 12.5,
  ".worker-id-extra .label": 11,
  ".articulos": 11,
  ".advertencias": 11,
  ".evidence-aside figcaption": 12.5,
  h2: 14.5,
};

const buildFontScaleCss = (delta: number) => {
  if (!delta) return "";
  const rules = Object.entries(FONT_SCALE_BASE)
    .map(([sel, base]) => {
      const next = Math.max(8, base + delta);
      return `.legal-page-document ${sel}{font-size:${next}px !important;}`;
    })
    .join("\n");
  return `/* live font-scale override (+${delta}px) */\n${rules}`;
};

export const buildLegalPreviewSrcDoc = (
  paginated: PaginatedLegalDocumentResult,
  fileName: string,
  options: BuildPreviewOptions = {},
) => {
  const baseHref = typeof window !== "undefined" ? `${window.location.origin}/` : "/";
  const title = escapeHtml(fileName.replace(/\.pdf$/i, ""));
  const { enableSelection = false, editable = false, imageReposition = false, blockEditing = false, fontDelta = 0 } = options;
  const fontScaleCss = buildFontScaleCss(fontDelta);

  const pagesHtml = paginated.pages
    .map((pageHtml, index) => {
      const footer = getLegalDocumentFooter(paginated.meta, index + 1, paginated.pages.length);

      return `
        <div class="legal-page-shell-preview">
          <div class="legal-page-shell">
            <div class="legal-page-content">
              <div class="legal-page-document"${editable ? ' contenteditable="true" spellcheck="false"' : ''}>${sanitizeHtml(pageHtml)}</div>
            </div>
            <div class="legal-page-footer">
              <span class="legal-page-footer-part">${escapeHtml(footer.left)}</span>
              <span class="legal-page-footer-part legal-page-footer-part--center">${escapeHtml(footer.center)}</span>
              <span class="legal-page-footer-part legal-page-footer-part--right">${escapeHtml(footer.right)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const selectionScript = enableSelection
    ? `
      <script>
        (function () {
          var lastText = '';
          function postSelection() {
            try {
              var sel = window.getSelection();
              if (!sel || sel.isCollapsed) {
                if (lastText) {
                  lastText = '';
                  parent.postMessage({ type: 'legal-doc-selection-cleared' }, '*');
                }
                return;
              }
              var text = sel.toString().trim();
              if (!text || text.length < 2) {
                if (lastText) {
                  lastText = '';
                  parent.postMessage({ type: 'legal-doc-selection-cleared' }, '*');
                }
                return;
              }
              var range = sel.getRangeAt(0);
              var rect = range.getBoundingClientRect();
              lastText = text;
              parent.postMessage({
                type: 'legal-doc-selection',
                text: text,
                rect: {
                  top: rect.top,
                  left: rect.left,
                  bottom: rect.bottom,
                  right: rect.right,
                  width: rect.width,
                  height: rect.height,
                },
              }, '*');
            } catch (e) { /* ignore */ }
          }
          document.addEventListener('mouseup', function () { setTimeout(postSelection, 10); });
          document.addEventListener('keyup', function (e) {
            if (e.shiftKey || e.key === 'Shift' || e.ctrlKey || e.metaKey) setTimeout(postSelection, 10);
          });
          document.addEventListener('selectionchange', function () {
            var sel = window.getSelection();
            if (!sel || sel.isCollapsed) {
              if (lastText) {
                lastText = '';
                parent.postMessage({ type: 'legal-doc-selection-cleared' }, '*');
              }
            }
          });
        })();
      </script>
    `
    : '';

  // The "request HTML" handler is needed for both editable mode AND image
  // reposition mode (so the parent can persist the updated `style` attributes).
  const needsHtmlExtractor = editable || imageReposition || blockEditing;
  const htmlExtractorScript = needsHtmlExtractor
    ? `
      <script>
        (function () {
          window.addEventListener('message', function (e) {
            if (!e.data || e.data.type !== 'legal-doc-request-html') return;
            var pages = Array.from(document.querySelectorAll('.legal-page-document'));
            var combined = pages.map(function (p) { return p.innerHTML; }).join('\\n');
            parent.postMessage({ type: 'legal-doc-edited-html', html: combined }, '*');
          });
        })();
      </script>
    `
    : '';

  const editableScript = editable
    ? `
      <script>
        (function () {
          // Notify parent on any input change so it can enable Save button
          document.addEventListener('input', function () {
            parent.postMessage({ type: 'legal-doc-editable-changed' }, '*');
          });
        })();
      </script>
    `
    : '';

  // In reposition mode, the iframe only handles SELECTION of an image (click).
  // The actual editor (drag/zoom/flip) lives OUTSIDE the iframe in a React modal.
  // This is much more reliable than trying to do complex pointer interactions
  // inside an iframe. On click we send the image data to the parent.
  const imageRepositionScript = imageReposition
    ? `
      <script>
        (function () {
          function findFrame(img) {
            var node = img.parentElement;
            for (var i = 0; i < 8 && node; i++) {
              var cs = getComputedStyle(node);
              if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.overflow === 'clip') {
                return node;
              }
              node = node.parentElement;
            }
            return img.parentElement || img;
          }

          function ensureId(img, idx) {
            var id = img.getAttribute('data-legal-image-id');
            if (id) return id;
            id = 'legal-img-' + idx + '-' + Date.now().toString(36);
            img.setAttribute('data-legal-image-id', id);
            return id;
          }

          var imgs = Array.from(document.querySelectorAll('img.evidence-image, .evidence-aside-frame img, figure img[alt="Evidencia"]'));
          imgs.forEach(function (img, idx) {
            ensureId(img, idx);
            img.setAttribute('draggable', 'false');
            img.style.cursor = 'pointer';

            img.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              var frame = findFrame(img);
              var rect = frame.getBoundingClientRect();
              parent.postMessage({
                type: 'legal-doc-image-clicked',
                id: img.getAttribute('data-legal-image-id'),
                src: img.currentSrc || img.src,
                naturalWidth: img.naturalWidth || 0,
                naturalHeight: img.naturalHeight || 0,
                frameWidth: Math.round(rect.width),
                frameHeight: Math.round(rect.height),
                currentObjectPosition: img.style.objectPosition || '',
                currentTransform: img.style.transform || '',
              }, '*');
            });
          });

          // Allow parent to apply a preview update without reloading the iframe
          window.addEventListener('message', function (e) {
            var d = e.data;
            if (!d || d.type !== 'legal-doc-image-apply') return;
            var img = document.querySelector('img[data-legal-image-id="' + d.id + '"]');
            if (!img) return;
            if (typeof d.objectPosition === 'string') img.style.objectPosition = d.objectPosition;
            if (typeof d.transform === 'string') {
              img.style.transform = d.transform;
              img.style.transformOrigin = 'center center';
            }
          });
        })();
      </script>
    `
    : '';

  const blockEditingScript = blockEditing
    ? `
      <script>
        (function () {
          var SELECTED_ID = null;

          function postBlockSelected(el) {
            if (!el) return;
            var id = el.getAttribute('data-block-id');
            if (!id) return;
            var rect = el.getBoundingClientRect();
            parent.postMessage({
              type: 'legal-doc-block-selected',
              id: id,
              rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
            }, '*');
          }

          function clearSelection() {
            document.querySelectorAll('[data-block-id].lbe-selected').forEach(function (n) { n.classList.remove('lbe-selected'); });
            SELECTED_ID = null;
            parent.postMessage({ type: 'legal-doc-block-deselected' }, '*');
          }

          function selectBlock(el) {
            document.querySelectorAll('[data-block-id].lbe-selected').forEach(function (n) { n.classList.remove('lbe-selected'); });
            el.classList.add('lbe-selected');
            SELECTED_ID = el.getAttribute('data-block-id');
            postBlockSelected(el);
          }

          document.addEventListener('click', function (e) {
            var t = e.target;
            if (!(t instanceof Element)) return;
            if (t.closest('.lbe-figure-trash')) return;
            if (t.closest('.lbe-handle')) return;
            var block = t.closest('.legal-page-document > [data-block-id]');
            if (!block) {
              var inner = t.closest('[data-block-id]');
              if (inner) {
                var page = inner.closest('.legal-page-document');
                if (page) {
                  var top = inner;
                  while (top.parentElement && top.parentElement !== page) top = top.parentElement;
                  if (top.hasAttribute && top.hasAttribute('data-block-id')) block = top;
                }
              }
            }
            if (!block) { clearSelection(); return; }
            e.preventDefault();
            e.stopPropagation();
            selectBlock(block);
          }, true);

          function injectFigureTrash() {
            var figs = Array.from(document.querySelectorAll('figure[data-figure-id]'));
            figs.forEach(function (fig) {
              if (fig.querySelector(':scope > .lbe-figure-trash')) return;
              if (getComputedStyle(fig).position === 'static') fig.style.position = 'relative';
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'lbe-figure-trash';
              btn.setAttribute('aria-label', 'Eliminar imagen');
              btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
              btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var block = fig.closest('[data-block-id]');
                if (!block) return;
                parent.postMessage({
                  type: 'legal-doc-figure-remove',
                  blockId: block.getAttribute('data-block-id'),
                  figureId: fig.getAttribute('data-figure-id'),
                }, '*');
              });
              fig.appendChild(btn);
            });
          }

          var dragState = null;
          var dropLine = null;

          function ensureDropLine() {
            if (dropLine) return dropLine;
            dropLine = document.createElement('div');
            dropLine.className = 'lbe-drop-line';
            document.body.appendChild(dropLine);
            return dropLine;
          }

          function findTargetBlock(x, y) {
            var pages = Array.from(document.querySelectorAll('.legal-page-document'));
            var page = null;
            for (var i = 0; i < pages.length; i++) {
              var r = pages[i].getBoundingClientRect();
              if (y >= r.top && y <= r.bottom) { page = pages[i]; break; }
              if (y < r.top) { page = pages[i]; break; }
            }
            if (!page) page = pages[pages.length - 1];
            if (!page) return null;
            var blocks = Array.from(page.querySelectorAll(':scope > [data-block-id]'));
            for (var j = 0; j < blocks.length; j++) {
              var br = blocks[j].getBoundingClientRect();
              var mid = (br.top + br.bottom) / 2;
              if (y < mid) return { block: blocks[j], position: 'before' };
            }
            return blocks.length ? { block: blocks[blocks.length - 1], position: 'after' } : null;
          }

          function showDropIndicator(x, y) {
            var t = findTargetBlock(x, y);
            if (!t || !t.block) return;
            var line = ensureDropLine();
            var br = t.block.getBoundingClientRect();
            line.style.left = (br.left + window.scrollX) + 'px';
            line.style.width = br.width + 'px';
            line.style.top = ((t.position === 'before' ? br.top - 2 : br.bottom) + window.scrollY) + 'px';
            line.style.display = 'block';
            dragState.target = t;
          }

          function finishDrag(x, y) {
            if (!dragState) return;
            var t = dragState.target || findTargetBlock(x, y);
            var activeId = dragState.activeId;
            cleanupDrag();
            if (!t || !t.block) return;
            var targetId = t.block.getAttribute('data-block-id');
            if (!targetId || targetId === activeId) return;
            var ordered = Array.from(document.querySelectorAll('.legal-page-document > [data-block-id]'))
              .map(function (n) { return n.getAttribute('data-block-id'); });
            ordered = ordered.filter(function (id) { return id !== activeId; });
            var idx = ordered.indexOf(targetId);
            if (idx < 0) idx = ordered.length;
            if (t.position === 'after') idx += 1;
            ordered.splice(idx, 0, activeId);
            parent.postMessage({ type: 'legal-doc-block-reorder', orderedIds: ordered }, '*');
          }

          function cleanupDrag() {
            document.querySelectorAll('.lbe-dragging').forEach(function (n) { n.classList.remove('lbe-dragging'); });
            document.body.classList.remove('lbe-drag-active');
            if (dropLine) dropLine.style.display = 'none';
            dragState = null;
          }

          function injectHandles() {
            var blocks = Array.from(document.querySelectorAll('.legal-page-document > [data-block-id]'));
            blocks.forEach(function (block) {
              if (block.querySelector(':scope > .lbe-handle')) return;
              if (getComputedStyle(block).position === 'static') block.style.position = 'relative';
              var handle = document.createElement('button');
              handle.type = 'button';
              handle.className = 'lbe-handle';
              handle.setAttribute('aria-label', 'Mover bloque');
              handle.title = 'Arrastra para mover';
              handle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';

              handle.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                e.stopPropagation();
                handle.setPointerCapture(e.pointerId);
                dragState = { activeId: block.getAttribute('data-block-id'), pointerId: e.pointerId };
                block.classList.add('lbe-dragging');
                document.body.classList.add('lbe-drag-active');
              });

              handle.addEventListener('pointermove', function (e) {
                if (!dragState || dragState.pointerId !== e.pointerId) return;
                showDropIndicator(e.clientX, e.clientY);
              });

              handle.addEventListener('pointerup', function (e) {
                if (!dragState || dragState.pointerId !== e.pointerId) return;
                finishDrag(e.clientX, e.clientY);
              });

              handle.addEventListener('pointercancel', cleanupDrag);

              block.appendChild(handle);
            });
          }

          function init() {
            injectHandles();
            injectFigureTrash();
            if (SELECTED_ID) {
              var el = document.querySelector('[data-block-id="' + CSS.escape(SELECTED_ID) + '"]');
              if (el) el.classList.add('lbe-selected');
            }
          }

          var mo = new MutationObserver(function () { init(); });
          mo.observe(document.body, { childList: true, subtree: true });

          window.addEventListener('message', function (e) {
            var d = e.data;
            if (!d) return;
            if (d.type === 'legal-doc-set-selection' && typeof d.id === 'string') {
              var el = document.querySelector('[data-block-id="' + CSS.escape(d.id) + '"]');
              if (el) selectBlock(el);
              else clearSelection();
            } else if (d.type === 'legal-doc-clear-selection') {
              clearSelection();
            } else if (d.type === 'legal-doc-request-block-rect' && typeof d.id === 'string') {
              var n = document.querySelector('[data-block-id="' + CSS.escape(d.id) + '"]');
              if (n) postBlockSelected(n);
            } else if (d.type === 'legal-doc-block-apply-style' && typeof d.id === 'string') {
              var node = document.querySelector('[data-block-id="' + CSS.escape(d.id) + '"]');
              if (!node) return;
              var p = d.patch || {};
              if ('marginTop' in p) { if (p.marginTop == null) node.style.removeProperty('margin-top'); else node.style.marginTop = p.marginTop + 'px'; }
              if ('marginBottom' in p) { if (p.marginBottom == null) node.style.removeProperty('margin-bottom'); else node.style.marginBottom = p.marginBottom + 'px'; }
              if ('paddingY' in p) {
                if (p.paddingY == null) { node.style.removeProperty('padding-top'); node.style.removeProperty('padding-bottom'); }
                else { node.style.paddingTop = p.paddingY + 'px'; node.style.paddingBottom = p.paddingY + 'px'; }
              }
              if ('paddingX' in p) {
                if (p.paddingX == null) { node.style.removeProperty('padding-left'); node.style.removeProperty('padding-right'); }
                else { node.style.paddingLeft = p.paddingX + 'px'; node.style.paddingRight = p.paddingX + 'px'; }
              }
              if ('scale' in p) {
                node.style.removeProperty('font-size');
                var sid = 'lbe-scale-' + String(d.id).replace(/[^a-zA-Z0-9_-]/g,'');
                var tag = document.head.querySelector('style[data-lbe-scale-id="' + sid + '"]');
                if (p.scale == null) {
                  if (tag) tag.parentNode.removeChild(tag);
                  node.removeAttribute('data-lbe-scale');
                } else {
                  var s = Number(p.scale);
                  var sel = '[data-block-id="' + String(d.id).replace(/"/g,'\\\\"') + '"]';
                  var css = sel + '{font-size:' + (12.5*s).toFixed(2) + 'px !important;line-height:1.55 !important;}'
                    + sel + ' *:not(h2):not(h3){font-size:inherit !important;}'
                    + sel + ' h2{font-size:' + (14.5*s).toFixed(2) + 'px !important;}'
                    + sel + ' h3{font-size:' + (13*s).toFixed(2) + 'px !important;}';
                  if (!tag) { tag = document.createElement('style'); tag.setAttribute('data-lbe-scale-id', sid); document.head.appendChild(tag); }
                  tag.textContent = css;
                  node.setAttribute('data-lbe-scale', String(s));
                }
              }
              postBlockSelected(node);
            } else if (d.type === 'legal-doc-block-clear-styles' && typeof d.id === 'string') {
              var n2 = document.querySelector('[data-block-id="' + CSS.escape(d.id) + '"]');
              if (!n2) return;
              ['margin-top','margin-bottom','padding-top','padding-bottom','padding-left','padding-right','font-size'].forEach(function(p){ n2.style.removeProperty(p); });
              n2.removeAttribute('data-block-margin-top');
              n2.removeAttribute('data-block-margin-bottom');
              n2.removeAttribute('data-block-size');
              n2.removeAttribute('data-lbe-scale');
              var sid2 = 'lbe-scale-' + String(d.id).replace(/[^a-zA-Z0-9_-]/g,'');
              var tag2 = document.head.querySelector('style[data-lbe-scale-id="' + sid2 + '"]');
              if (tag2) tag2.parentNode.removeChild(tag2);
              postBlockSelected(n2);
            }
          });

          window.addEventListener('scroll', function () {
            if (!SELECTED_ID) return;
            var n = document.querySelector('[data-block-id="' + CSS.escape(SELECTED_ID) + '"]');
            if (n) postBlockSelected(n);
          }, true);

          init();
        })();
      </script>
    `
    : '';


  return `<!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <base href="${baseHref}" />
        <style>
          ${LEGAL_PAGE_BASE_CSS}
          ${paginated.scopedCss}

          :root { color-scheme: light; }

          html, body {
            margin: 0;
            padding: 0;
            background: transparent;
          }

          body {
            box-sizing: border-box;
            padding: 24px 16px 32px;
            font-family: 'Poppins', system-ui, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .legal-preview-root {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 24px;
          }

          .legal-page-shell-preview {
            width: ${LEGAL_A4_WIDTH}px;
            overflow: hidden;
            border-radius: 2px;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
          }

          ${editable ? `
          .legal-page-document[contenteditable="true"] {
            outline: none;
            cursor: text;
          }
          .legal-page-document[contenteditable="true"]:focus-within {
            box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.35);
          }
          ` : ''}

          ${imageReposition ? `
          /* Indicate every evidence image is clickable to open the editor */
          .evidence-image {
            cursor: pointer !important;
            outline: 2px solid rgba(59, 130, 246, 0.45);
            outline-offset: -2px;
            transition: outline-color .15s ease-out, box-shadow .15s ease-out;
          }
          .evidence-image:hover {
            outline-color: rgba(59, 130, 246, 0.95);
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.18);
          }
          ` : ''}

          ${enableSelection ? `
          ::selection { background: rgba(59, 130, 246, 0.3); color: inherit; }
          ` : ''}

          ${blockEditing ? `
          .legal-page-document > [data-block-id]{
            outline: 1px dashed transparent;
            outline-offset: 4px;
            transition: outline-color .12s ease-out, background-color .12s ease-out;
            cursor: pointer;
          }
          .legal-page-document > [data-block-id]:hover{
            outline-color: rgba(59,130,246,.55);
            background: rgba(59,130,246,.04);
          }
          .legal-page-document > [data-block-id].lbe-selected{
            outline: 2px solid rgba(59,130,246,.85);
            background: rgba(59,130,246,.07);
          }
          .legal-page-document > [data-block-id].lbe-dragging{ opacity:.55; }
          .lbe-handle{
            position: absolute;
            top: 6px; left: -28px;
            width: 22px; height: 28px;
            display: inline-flex; align-items:center; justify-content:center;
            border: 1px solid rgba(59,130,246,.45);
            background: #fff;
            color: rgba(59,130,246,.85);
            border-radius: 6px;
            cursor: grab;
            opacity: 0;
            transition: opacity .12s ease-out;
            box-shadow: 0 2px 6px rgba(0,0,0,.06);
            padding: 0;
            touch-action: none;
            z-index: 5;
          }
          .legal-page-document > [data-block-id]:hover > .lbe-handle,
          .legal-page-document > [data-block-id].lbe-selected > .lbe-handle{ opacity: 1; }
          .lbe-handle:active{ cursor: grabbing; }
          body.lbe-drag-active{ cursor: grabbing !important; user-select: none !important; }
          .lbe-drop-line{
            position: absolute;
            display: none;
            height: 3px;
            background: rgba(59,130,246,.95);
            border-radius: 2px;
            pointer-events: none;
            box-shadow: 0 0 0 3px rgba(59,130,246,.18);
            z-index: 9999;
          }
          figure[data-figure-id]{ position: relative; }
          .lbe-figure-trash{
            position: absolute;
            top: 6px; right: 6px;
            width: 24px; height: 24px;
            display: inline-flex; align-items:center; justify-content:center;
            border: none;
            background: rgba(220,38,38,.92);
            color: #fff;
            border-radius: 999px;
            cursor: pointer;
            opacity: 0;
            transition: opacity .12s ease-out, transform .12s ease-out;
            box-shadow: 0 2px 6px rgba(0,0,0,.18);
            padding: 0;
            z-index: 4;
          }
          figure[data-figure-id]:hover .lbe-figure-trash{ opacity: 1; }
          .lbe-figure-trash:hover{ transform: scale(1.08); }
          ` : ''}

          ${fontScaleCss}

          @page {
            size: A4;
            margin: 0;
          }

          @media print {
            html, body {
              background: #fff !important;
            }

            body {
              padding: 0 !important;
            }

            .legal-preview-root {
              display: block !important;
            }

            .legal-page-shell-preview {
              width: ${LEGAL_A4_WIDTH}px !important;
              margin: 0 !important;
              overflow: hidden !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              break-after: page !important;
              page-break-after: always !important;
            }

            .legal-page-shell-preview:last-child {
              break-after: auto !important;
              page-break-after: auto !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="legal-preview-root">${pagesHtml}</div>
        ${selectionScript}
        ${editableScript}
        ${imageRepositionScript}
        ${blockEditingScript}
        ${htmlExtractorScript}
      </body>
    </html>`;
};
