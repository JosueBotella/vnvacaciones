import { jsPDF } from "jspdf";
import { getFontEmbedCSS, toCanvas } from "html-to-image";

import { waitForLegalDocumentAssets } from "./legalDocumentPagination";

const INVALID_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const LEGAL_CAPTURE_SCALE = 3;
const LEGAL_PDF_PAGE_INSET_MM = 0.8;
const LEGAL_BLANK_SAMPLE_SIZE = 48;
const LEGAL_BLANK_RGB_THRESHOLD = 245;
const LEGAL_BLANK_MIN_NON_WHITE_PIXELS = 12;

const sanitizePdfFileName = (value: string) => {
  const normalized = String(value || "documento-legal.pdf")
    .trim()
    .replace(INVALID_FILE_NAME_CHARS, " ")
    .replace(/\s+/g, " ");

  if (!normalized) return "documento-legal.pdf";
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized}.pdf`;
};

const hasVisibleCanvasContent = (canvas: HTMLCanvasElement) => {
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = LEGAL_BLANK_SAMPLE_SIZE;
  sampleCanvas.height = LEGAL_BLANK_SAMPLE_SIZE;

  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return true;

  sampleContext.fillStyle = "#ffffff";
  sampleContext.fillRect(0, 0, LEGAL_BLANK_SAMPLE_SIZE, LEGAL_BLANK_SAMPLE_SIZE);
  sampleContext.drawImage(canvas, 0, 0, LEGAL_BLANK_SAMPLE_SIZE, LEGAL_BLANK_SAMPLE_SIZE);

  const { data } = sampleContext.getImageData(0, 0, LEGAL_BLANK_SAMPLE_SIZE, LEGAL_BLANK_SAMPLE_SIZE);
  let nonWhitePixels = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 0) continue;

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];

    if (
      red < LEGAL_BLANK_RGB_THRESHOLD ||
      green < LEGAL_BLANK_RGB_THRESHOLD ||
      blue < LEGAL_BLANK_RGB_THRESHOLD
    ) {
      nonWhitePixels += 1;
      if (nonWhitePixels >= LEGAL_BLANK_MIN_NON_WHITE_PIXELS) {
        return true;
      }
    }
  }

  return false;
};

const absolutizeCaptureAssetUrls = (root: ParentNode) => {
  if (typeof window === "undefined") return;

  root.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const src = image.getAttribute("src");
    if (!src) return;

    try {
      image.setAttribute("src", new URL(src, window.location.origin).href);
    } catch {
      // ignore invalid asset URLs
    }
  });
};

const createDetachedCaptureRoot = (pageElement: HTMLElement) => {
  const clone = pageElement.cloneNode(true) as HTMLElement;
  const { width, height } = pageElement.getBoundingClientRect();

  const captureRoot = document.createElement("div");
  captureRoot.setAttribute("data-legal-pdf-capture-root", "true");
  captureRoot.style.position = "fixed";
  captureRoot.style.left = "-10000px";
  captureRoot.style.top = "0";
  captureRoot.style.width = `${Math.ceil(width)}px`;
  captureRoot.style.minHeight = `${Math.ceil(height)}px`;
  captureRoot.style.padding = "0";
  captureRoot.style.margin = "0";
  captureRoot.style.background = "#ffffff";
  captureRoot.style.overflow = "visible";
  captureRoot.style.pointerEvents = "none";
  captureRoot.style.zIndex = "-1";

  clone.style.margin = "0";
  clone.style.boxShadow = "none";
  clone.style.transform = "none";
  clone.style.position = "relative";
  clone.style.left = "0";
  clone.style.top = "0";

  absolutizeCaptureAssetUrls(clone);
  captureRoot.appendChild(clone);
  document.body.appendChild(captureRoot);

  return { captureRoot, captureElement: clone };
};

let cachedFontEmbedCssPromise: Promise<string> | null = null;

const getSharedFontEmbedCss = (node: HTMLElement) => {
  if (!cachedFontEmbedCssPromise) {
    cachedFontEmbedCssPromise = getFontEmbedCSS(node, {
      preferredFontFormat: "woff2",
    }).catch(() => "");
  }

  return cachedFontEmbedCssPromise;
};

const renderLegalPage = async (pageElement: HTMLElement) => {
  const { captureRoot, captureElement } = createDetachedCaptureRoot(pageElement);
  const { width, height } = captureElement.getBoundingClientRect();

  try {
    await waitForLegalDocumentAssets(captureRoot);
    const fontEmbedCSS = await getSharedFontEmbedCss(captureElement);

    return await toCanvas(captureElement, {
      backgroundColor: "#ffffff",
      cacheBust: true,
      pixelRatio: LEGAL_CAPTURE_SCALE,
      preferredFontFormat: "woff2",
      fontEmbedCSS,
      width: Math.ceil(width),
      height: Math.ceil(height),
      canvasWidth: Math.ceil(width * LEGAL_CAPTURE_SCALE),
      canvasHeight: Math.ceil(height * LEGAL_CAPTURE_SCALE),
      skipAutoScale: true,
    });
  } finally {
    captureRoot.remove();
  }
};

const captureLegalPage = async (pageElement: HTMLElement) => {
  await waitForLegalDocumentAssets(pageElement);
  const canvas = await renderLegalPage(pageElement);

  if (hasVisibleCanvasContent(canvas)) {
    return canvas;
  }

  throw new Error("No se pudo renderizar el contenido del PDF");
};

interface BuildLegalPdfOptions {
  autoPrint?: boolean;
}

const buildLegalDocumentPdf = async (
  pageElements: HTMLElement[],
  fileName: string,
  options: BuildLegalPdfOptions = {},
) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PDF export is only available in the browser");
  }

  if (!pageElements.length) {
    throw new Error("No hay páginas listas para exportar");
  }

  const safeFileName = sanitizePdfFileName(fileName);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const renderWidth = pdfWidth - LEGAL_PDF_PAGE_INSET_MM * 2;
  const renderHeight = pdfHeight - LEGAL_PDF_PAGE_INSET_MM * 2;

  for (let index = 0; index < pageElements.length; index += 1) {
    const canvas = await captureLegalPage(pageElements[index]);
    const imageData = canvas.toDataURL("image/png");

    if (index > 0) {
      pdf.addPage();
    }

    pdf.addImage(imageData, "PNG", LEGAL_PDF_PAGE_INSET_MM, LEGAL_PDF_PAGE_INSET_MM, renderWidth, renderHeight);
  }

  pdf.setProperties({
    title: safeFileName.replace(/\.pdf$/i, ""),
  });

  if (options.autoPrint) {
    pdf.autoPrint();
  }

  return { pdf, safeFileName };
};

export const downloadLegalDocumentPdf = async (
  pageElements: HTMLElement[],
  fileName: string,
) => {
  const { pdf, safeFileName } = await buildLegalDocumentPdf(pageElements, fileName);
  pdf.save(safeFileName);
};

export const openLegalDocumentPrintPreview = async (
  pageElements: HTMLElement[],
  fileName: string,
) => {
  const { pdf, safeFileName } = await buildLegalDocumentPdf(pageElements, fileName, { autoPrint: true });
  const pdfBlob = pdf.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(pdfUrl, "_blank", "noopener,noreferrer");

  if (!printWindow) {
    URL.revokeObjectURL(pdfUrl);
    throw new Error("Permite ventanas emergentes para abrir la impresión");
  }

  window.setTimeout(() => {
    URL.revokeObjectURL(pdfUrl);
  }, 60000);

  return { printWindow, safeFileName };
};

const SRCDOC_IFRAME_A4_WIDTH = 794;

/**
 * Prints the paginated srcDoc directly from an A4 iframe.
 * This mirrors the stable preview print flow used in Propuestas and avoids
 * the canvas/html-to-image rasterization path that can fail on cloned content.
 */
export const openLegalDocumentPrintPreviewFromSrcDoc = async (
  srcDoc: string,
  fileName: string,
) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PDF export is only available in the browser");
  }

  const safeFileName = sanitizePdfFileName(fileName);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${SRCDOC_IFRAME_A4_WIDTH}px`;
  iframe.style.height = "1123px";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  iframe.srcdoc = srcDoc;
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error("No se pudo preparar la impresión"));
    });

    const frameWindow = iframe.contentWindow;
    const frameDocument = iframe.contentDocument;

    if (!frameWindow || !frameDocument) {
      throw new Error("No se pudo cargar la vista de impresión");
    }

    await waitForLegalDocumentAssets(frameDocument);

    const pageElements = Array.from(
      frameDocument.querySelectorAll<HTMLElement>(".legal-page-shell"),
    );

    if (!pageElements.length) {
      throw new Error("No hay páginas listas para imprimir");
    }

    for (const element of pageElements) {
      const { width, height } = element.getBoundingClientRect();
      if (width < 10 || height < 10) {
        throw new Error("Las páginas no tienen un tamaño válido para imprimir");
      }
    }

    frameDocument.title = safeFileName.replace(/\.pdf$/i, "");

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      iframe.remove();
    };

    frameWindow.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 60000);

    frameWindow.focus();
    frameWindow.print();

    return { printWindow: frameWindow, safeFileName };
  } catch (error) {
    iframe.remove();
    throw error;
  }
};

/**
 * Genera el PDF del documento legal a partir del srcDoc paginado y devuelve
 * el contenido como base64 (sin prefijo data URL). Pensado para subirlo al
 * backend y adjuntarlo a emails.
 */
export const generateLegalPdfBase64FromSrcDoc = async (
  srcDoc: string,
  fileName: string,
): Promise<{ base64: string; safeFileName: string }> => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PDF generation is only available in the browser");
  }

  const safeFileName = sanitizePdfFileName(fileName);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${SRCDOC_IFRAME_A4_WIDTH}px`;
  iframe.style.height = "1123px";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  iframe.srcdoc = srcDoc;
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error("No se pudo preparar el PDF"));
    });

    const frameDocument = iframe.contentDocument;
    if (!frameDocument) {
      throw new Error("No se pudo cargar el documento");
    }

    await waitForLegalDocumentAssets(frameDocument);

    const pageElements = Array.from(
      frameDocument.querySelectorAll<HTMLElement>(".legal-page-shell"),
    );

    if (!pageElements.length) {
      throw new Error("No hay páginas listas para exportar");
    }

    const { pdf } = await buildLegalDocumentPdf(pageElements, safeFileName);
    const dataUri = pdf.output("datauristring");
    const base64 = dataUri.includes(",") ? dataUri.split(",")[1] : dataUri;
    return { base64, safeFileName };
  } finally {
    iframe.remove();
  }
};

/**
 * Descarga el PDF paginado del documento legal a partir del srcDoc.
 * Útil cuando solo tenemos el HTML guardado en BD y no hay pdf_url.
 */
export const downloadLegalPdfFromSrcDoc = async (
  srcDoc: string,
  fileName: string,
): Promise<{ safeFileName: string }> => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PDF generation is only available in the browser");
  }

  const safeFileName = sanitizePdfFileName(fileName);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${SRCDOC_IFRAME_A4_WIDTH}px`;
  iframe.style.height = "1123px";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  iframe.srcdoc = srcDoc;
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error("No se pudo preparar el PDF"));
    });

    const frameDocument = iframe.contentDocument;
    if (!frameDocument) throw new Error("No se pudo cargar el documento");

    await waitForLegalDocumentAssets(frameDocument);

    const pageElements = Array.from(
      frameDocument.querySelectorAll<HTMLElement>(".legal-page-shell"),
    );
    if (!pageElements.length) throw new Error("No hay páginas listas para exportar");

    const { pdf } = await buildLegalDocumentPdf(pageElements, safeFileName);
    pdf.save(safeFileName);
    return { safeFileName };
  } finally {
    iframe.remove();
  }
};
