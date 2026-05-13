// Shared evidence compressor used by Encargado + Admin upload flows.
//
// - Images: downscale to 1600px max + JPEG 0.8 (skips small files).
// - Videos: re-encode with ffmpeg.wasm to MP4 H.264 720p ~1.2 Mbps, AAC 96k.
//   Falls back to the original file if ffmpeg fails or makes it larger.
// - Other types (PDF, Office, txt, csv): passthrough untouched.
//
// All paths report progress via an optional callback so the UI can show
// "Comprimiendo vídeo…" instead of silently freezing.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import ffmpegCoreURL from "@ffmpeg/core?url";
import ffmpegCoreWasmURL from "@ffmpeg/core/wasm?url";

let ffmpegInstance: FFmpeg | null = null;

async function getFfmpeg(): Promise<FFmpeg> {
  if (!ffmpegInstance) ffmpegInstance = new FFmpeg();
  if (!ffmpegInstance.loaded) {
    await ffmpegInstance.load({ coreURL: ffmpegCoreURL, wasmURL: ffmpegCoreWasmURL });
  }
  return ffmpegInstance;
}

export type CompressionStage =
  | "idle"
  | "image-compress"
  | "video-load"
  | "video-encode"
  | "passthrough"
  | "done"
  | "skipped";

export interface CompressionProgress {
  stage: CompressionStage;
  /** 0..1 progress when known (videos), undefined for indeterminate. */
  ratio?: number;
  message?: string;
}

const IMAGE_TARGET_MAX_DIM = 1920;
const IMAGE_QUALITY = 0.8;
const IMAGE_SKIP_BELOW_BYTES = 600 * 1024; // 600 KB → don't bother

async function compressImage(
  file: File,
  onProgress?: (p: CompressionProgress) => void,
): Promise<File> {
  if (file.size < IMAGE_SKIP_BELOW_BYTES) {
    onProgress?.({ stage: "skipped", message: "Imagen ya pequeña" });
    return file;
  }
  onProgress?.({ stage: "image-compress", message: "Optimizando imagen…" });
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Imagen ilegible"));
      i.src = blobUrl;
    });
    const scale = Math.min(1, IMAGE_TARGET_MAX_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) =>
      canvas.toBlob((b) => r(b), "image/jpeg", IMAGE_QUALITY),
    );
    if (!blob || blob.size === 0) return file;
    if (blob.size >= file.size) return file; // compression made no gain
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

const VIDEO_SKIP_BELOW_BYTES = 8 * 1024 * 1024; // 8 MB → keep original

async function compressVideo(
  file: File,
  onProgress?: (p: CompressionProgress) => void,
): Promise<File> {
  if (file.size < VIDEO_SKIP_BELOW_BYTES) {
    onProgress?.({ stage: "skipped", message: "Vídeo ya ligero" });
    return file;
  }
  try {
    onProgress?.({ stage: "video-load", message: "Preparando compresor de vídeo…" });
    const ffmpeg = await getFfmpeg();

    const inExt = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const inputName = `in-${crypto.randomUUID()}.${inExt}`;
    const outputName = `out-${crypto.randomUUID()}.mp4`;

    const buf = new Uint8Array(await file.arrayBuffer());
    await ffmpeg.writeFile(inputName, buf);

    onProgress?.({ stage: "video-encode", ratio: 0, message: "Comprimiendo vídeo…" });

    const progressHandler = ({ progress }: { progress: number }) => {
      if (typeof progress === "number" && Number.isFinite(progress)) {
        onProgress?.({
          stage: "video-encode",
          ratio: Math.max(0, Math.min(1, progress)),
          message: "Comprimiendo vídeo…",
        });
      }
    };
    ffmpeg.on("progress", progressHandler);

    let succeeded = false;
    try {
      const code = await ffmpeg.exec(
        [
          "-i", inputName,
          "-vf", "scale='min(1280,iw)':-2",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "28",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-c:a", "aac",
          "-b:a", "96k",
          "-ac", "2",
          "-y",
          outputName,
        ],
        // Generous timeout for big files; ffmpeg.wasm is slow.
        15 * 60 * 1000,
      );
      succeeded = code === 0;
    } catch (e) {
      console.warn("[evidenceCompressor] ffmpeg exec failed:", e);
      succeeded = false;
    } finally {
      ffmpeg.off("progress", progressHandler);
    }

    if (!succeeded) {
      await ffmpeg.deleteFile(inputName).catch(() => undefined);
      await ffmpeg.deleteFile(outputName).catch(() => undefined);
      onProgress?.({ stage: "skipped", message: "No se pudo comprimir; subiendo original" });
      return file;
    }

    const data = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);

    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      onProgress?.({ stage: "skipped", message: "Compresión vacía; subiendo original" });
      return file;
    }
    if (data.byteLength >= file.size) {
      // Compression bigger than original → keep original
      onProgress?.({ stage: "skipped", message: "Compresión sin mejora; subiendo original" });
      return file;
    }

    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".mp4";
    onProgress?.({ stage: "done", ratio: 1, message: "Vídeo optimizado" });
    return new File([arrayBuffer], newName, { type: "video/mp4", lastModified: Date.now() });
  } catch (e) {
    console.warn("[evidenceCompressor] Video compression failed:", e);
    onProgress?.({ stage: "skipped", message: "No se pudo comprimir; subiendo original" });
    return file;
  }
}

/**
 * Main entry point — apply best-effort compression to a single file.
 * Always returns a File (original on any failure). Never throws.
 */
export async function compressEvidenceFile(
  file: File,
  onProgress?: (p: CompressionProgress) => void,
): Promise<File> {
  try {
    if (file.type.startsWith("image/")) {
      return await compressImage(file, onProgress);
    }
    if (file.type.startsWith("video/")) {
      return await compressVideo(file, onProgress);
    }
    onProgress?.({ stage: "passthrough", message: "Subiendo archivo" });
    return file;
  } catch (e) {
    console.warn("[evidenceCompressor] Unexpected error:", e);
    return file;
  }
}

/** Hard upper bound after compression (admins/encargados). 500 MB is the
 *  Storage limit set in the backend. */
export const EVIDENCE_MAX_BYTES = 500 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
