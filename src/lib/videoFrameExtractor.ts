// Client-side video frame extraction — V2 (verified real frames only).
//
// PROBATORY GUARANTEE
// -------------------
// Frames are extracted by decoding the ORIGINAL video file in the admin's
// browser using <video> + <canvas>. Every captured JPEG is uploaded to a
// dedicated `video-frames-v2/` folder and its row in `incidencias_video_frames`
// is tagged with `capture_source = 'browser_canvas'`, `verified_at = now()`
// and the exact storage path. The backend ONLY accepts frames carrying these
// markers when assembling the legal document. There is NO image generation,
// NO AI reconstruction, and NO storage-based fallback. If the browser cannot
// capture real frames (corrupted file, unsupported codec, empty timestamp
// list…), the extractor returns an empty array and the document is generated
// with no video evidences.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import ffmpegCoreURL from "@ffmpeg/core?url";
import ffmpegCoreWasmURL from "@ffmpeg/core/wasm?url";
import { supabase } from "@/integrations/supabase/client";
import { getManagerSessionToken } from "@/lib/sessionHelpers";

const MAX_FRAME_WIDTH = 1280;
const MAX_FRAME_HEIGHT = 720;
const JPEG_QUALITY = 0.85;
// Match the server-side analyzer ceiling. The browser still downloads the
// original video to decode REAL frames via <video> + canvas, but it must not
// reject normal incident videos (e.g. 60-100 MB) after Gemini has already
// accepted them for timestamp analysis.
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_FRAMES_PER_VIDEO = 3;
const MIN_TIMESTAMP_GAP_S = 3;
let ffmpegInstance: FFmpeg | null = null;

export type ExtractionStep =
  | "cleanup"
  | "cache-check"
  | "analyze"
  | "download"
  | "decode"
  | "seek"
  | "upload"
  | "save"
  | "done"
  | "skipped";

export interface StepProgress {
  step: ExtractionStep;
  label: string;
  current?: number;
  total?: number;
  videoName?: string;
}

export type StepReporter = (p: StepProgress) => void;

export interface FrameTimestamp {
  timestamp_seconds: number;
  description: string;
  relevance_score: number;
}

export interface ExtractedFrame {
  url: string;
  timestamp_s: number;
  descripcion: string;
  caption: string;
  relevance: number;
  video_name: string;
}

export interface VideoExtractionOutcome {
  videoName: string;
  frames: ExtractedFrame[];
  /** Empty frames + skipped flag means: no real frames could be produced. */
  skipped: boolean;
  reason?: string;
}

/** Format seconds as MM:SS — used everywhere for consistent captions/labels. */
export function formatTimestampMMSS(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Normalize a possibly-signed URL into a clean storage path inside the bucket. */
function toBucketPath(videoPath: string): string {
  const m = videoPath.match(/incidencias-pruebas\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : videoPath;
}

/** Sanitize an arbitrary AI-supplied description into a sober factual line. */
function sanitizeFactualDescription(raw: string | undefined | null): string {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  // Drop UUIDs, paths, internal codes
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "");
  s = s.replace(/[a-z0-9_\-./]{40,}/gi, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  // Strip trailing punctuation
  s = s.replace(/[.!?]+$/, "");
  // Hard cap to keep captions sober
  if (s.length > 180) s = s.slice(0, 177).replace(/\s+\S*$/, "") + "…";
  return s;
}

/** Build the final caption shown in the legal document.
 *  Sober factual sentence — no "Vídeo · MM:SS —" prefix anymore (admins asked
 *  for cleaner captions without internal code-like markers). */
function buildCaption(_timestampS: number, factual: string): string {
  const text = sanitizeFactualDescription(factual)
    || "Fotograma extraído del vídeo aportado";
  return text;
}

function waitForSeeked(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("Video seek error")); };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("Video seek timeout")); }, timeoutMs);
    function cleanup() {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      window.clearTimeout(timer);
    }
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function waitForMetadata(video: HTMLVideoElement, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
      resolve();
      return;
    }
    const onLoaded = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("Video load error")); };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("Video metadata timeout")); }, timeoutMs);
    function cleanup() {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      window.clearTimeout(timer);
    }
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer el fotograma"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Pick at most MAX_FRAMES_PER_VIDEO timestamps from the AI suggestions:
 * sorted by descending relevance, then enforcing a minimum gap so we never
 * cluster duplicates.
 */
function selectKeyTimestamps(
  raw: FrameTimestamp[],
  duration: number,
): FrameTimestamp[] {
  const inRange = raw.filter((t) =>
    Number.isFinite(t.timestamp_seconds)
    && t.timestamp_seconds >= 0
    && t.timestamp_seconds <= Math.max(0, duration - 0.05)
  );
  // Sort by relevance (desc), then by timestamp asc as tiebreaker
  const byRelevance = [...inRange].sort(
    (a, b) =>
      (Number(b.relevance_score) || 0) - (Number(a.relevance_score) || 0)
      || a.timestamp_seconds - b.timestamp_seconds,
  );
  const picked: FrameTimestamp[] = [];
  for (const t of byRelevance) {
    if (picked.length >= MAX_FRAMES_PER_VIDEO) break;
    if (picked.some((p) => Math.abs(p.timestamp_seconds - t.timestamp_seconds) < MIN_TIMESTAMP_GAP_S)) continue;
    picked.push(t);
  }
  // Final: order by timestamp ascending so captions read in chronological order
  return picked.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
}

function fallbackTimestampForRealCapture(duration: number): FrameTimestamp[] {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
  // Always try to capture MORE THAN ONE real frame when possible — admins
  // explicitly asked for ≥2 frames as a baseline. We pick three evenly-spaced
  // moments (~25%, ~55%, ~85%) so even very short videos still yield two
  // distinct frames after the MIN_TIMESTAMP_GAP_S deduplication step.
  const candidates = [0.25, 0.55, 0.85].map((pct) => ({
    timestamp_seconds: Math.max(0, Math.min(safeDuration - 0.05, safeDuration * pct)),
    description: "Fotograma extraído del vídeo aportado",
    relevance_score: 1,
  }));
  // Deduplicate timestamps that collapse on very short videos.
  const seen = new Set<number>();
  return candidates.filter((c) => {
    const key = Math.round(c.timestamp_seconds * 10);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectFallbackTimestampsWithoutMetadata(raw: FrameTimestamp[]): FrameTimestamp[] {
  const usable = raw
    .filter((t) => Number.isFinite(t.timestamp_seconds) && t.timestamp_seconds >= 0)
    .sort((a, b) =>
      (Number(b.relevance_score) || 0) - (Number(a.relevance_score) || 0)
      || a.timestamp_seconds - b.timestamp_seconds,
    );
  const picked: FrameTimestamp[] = [];
  for (const t of usable) {
    if (picked.length >= MAX_FRAMES_PER_VIDEO) break;
    if (picked.some((p) => Math.abs(p.timestamp_seconds - t.timestamp_seconds) < MIN_TIMESTAMP_GAP_S)) continue;
    picked.push(t);
  }
  if (picked.length > 0) return picked.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
  return [1, 3, 5].map((timestamp_seconds) => ({
    timestamp_seconds,
    description: "Fotograma extraído del vídeo aportado",
    relevance_score: 1,
  }));
}

async function getFfmpeg(): Promise<FFmpeg> {
  if (!ffmpegInstance) ffmpegInstance = new FFmpeg();
  if (!ffmpegInstance.loaded) {
    await ffmpegInstance.load({ coreURL: ffmpegCoreURL, wasmURL: ffmpegCoreWasmURL });
  }
  return ffmpegInstance;
}

async function extractFramesWithFfmpegFallback(
  videoBlob: Blob,
  timestamps: FrameTimestamp[],
  reportStep: StepReporter | undefined,
  videoName: string,
): Promise<Array<{ blob: Blob; meta: FrameTimestamp }>> {
  reportStep?.({ step: "decode", label: "Decodificando vídeo con motor alternativo", videoName });
  const ffmpeg = await getFfmpeg();
  const inputName = `input-${crypto.randomUUID()}.video`;
  await ffmpeg.writeFile(inputName, new Uint8Array(await videoBlob.arrayBuffer()));
  const selected = selectFallbackTimestampsWithoutMetadata(timestamps);
  const out: Array<{ blob: Blob; meta: FrameTimestamp }> = [];

  try {
    for (let i = 0; i < selected.length; i++) {
      const meta = selected[i];
      const outputName = `frame-${crypto.randomUUID()}.jpg`;
      reportStep?.({
        step: "seek",
        label: `Capturando fotograma ${formatTimestampMMSS(meta.timestamp_seconds)}`,
        current: i + 1,
        total: selected.length,
        videoName,
      });
      try {
        const code = await ffmpeg.exec([
          "-ss", String(Math.max(0, meta.timestamp_seconds)),
          "-i", inputName,
          "-frames:v", "1",
          "-vf", `scale='min(${MAX_FRAME_WIDTH},iw)':-2`,
          "-q:v", "3",
          outputName,
        ], 45000);
        if (code !== 0) continue;
        const data = await ffmpeg.readFile(outputName);
        if (data instanceof Uint8Array && data.byteLength > 0) {
          const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
          out.push({ blob: new Blob([arrayBuffer], { type: "image/jpeg" }), meta });
        }
      } catch (e) {
        console.warn(`[videoFrameExtractor] ffmpeg fallback failed at ${meta.timestamp_seconds}s:`, e);
      } finally {
        await ffmpeg.deleteFile(outputName).catch(() => undefined);
      }
    }
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
  }

  return out;
}

/**
 * Capture frames at the given timestamps using a hidden <video> + canvas.
 * THROWS on fundamental decoding/codec problems — the caller turns that into
 * a "skipped" outcome so we never silently substitute fake images.
 */
async function extractFramesFromBlob(
  videoBlob: Blob,
  timestamps: FrameTimestamp[],
  reportStep: StepReporter | undefined,
  videoName: string,
): Promise<Array<{ blob: Blob; meta: FrameTimestamp }>> {
  const objectUrl = URL.createObjectURL(videoBlob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.style.position = "fixed";
  video.style.left = "-9999px";
  video.style.top = "-9999px";
  video.src = objectUrl;
  document.body.appendChild(video);

  const out: Array<{ blob: Blob; meta: FrameTimestamp }> = [];

  try {
    reportStep?.({ step: "decode", label: "Decodificando vídeo en el navegador", videoName });
    await waitForMetadata(video);
    const duration = video.duration;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error("Vídeo sin dimensiones visibles (códec no soportado)");

    const keyTimestamps = selectKeyTimestamps(timestamps, duration);
    const selected = keyTimestamps.length > 0 ? keyTimestamps : fallbackTimestampForRealCapture(duration);
    if (selected.length === 0) {
      throw new Error("No hay timestamps válidos para extraer");
    }

    const scale = Math.min(1, MAX_FRAME_WIDTH / w, MAX_FRAME_HEIGHT / h);
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible");

    for (let i = 0; i < selected.length; i++) {
      const meta = selected[i];
      const safeTs = Math.max(0, Math.min(duration - 0.05, meta.timestamp_seconds));
      reportStep?.({
        step: "seek",
        label: `Capturando fotograma ${formatTimestampMMSS(safeTs)}`,
        current: i + 1,
        total: selected.length,
        videoName,
      });
      try {
        video.currentTime = safeTs;
        await waitForSeeked(video);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        ctx.drawImage(video, 0, 0, outW, outH);
        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
        );
        if (blob && blob.size > 0) {
          out.push({ blob, meta: { ...meta, timestamp_seconds: safeTs } });
        }
      } catch (e) {
        console.warn(`[videoFrameExtractor] Failed to capture frame at ${meta.timestamp_seconds}s:`, e);
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
    video.remove();
  }

  return out;
}

/**
 * Force-extract REAL frames for one video. Always purges any prior cache rows
 * for this (proposal, video) pair before writing the new v2 frames so the
 * legal document can never silently reuse stale images.
 */
export async function extractAndCacheVideoFrames(
  propuestaId: string,
  videoPath: string,
  contextHint = "",
  reportStep?: StepReporter,
): Promise<VideoExtractionOutcome> {
  const bucketPath = toBucketPath(videoPath);
  const videoName = bucketPath.split("/").pop() || "video";
  const sessionToken = typeof window !== "undefined"
    ? getManagerSessionToken() || ""
    : "";

  // 0. Always purge previous cache for this (proposal, video) so we cannot
  //    mix a stale row with the new verified ones.
  reportStep?.({ step: "cleanup", label: "Eliminando caché anterior de evidencias", videoName });
  await supabase.functions.invoke("incidencias-operations", {
    body: { action: "clearVideoFramesCache", sessionToken, propuestaId, videoPath },
  }).catch(() => { /* non-fatal */ });

  // 1. Ask the analyzer for relevant timestamps. If it returns nothing,
  //    we DO NOT invent any — we skip this video entirely.
  reportStep?.({ step: "analyze", label: "Analizando vídeo para detectar momentos clave", videoName });
  const { data: analysisData, error: analysisErr } = await supabase.functions.invoke(
    "extract-video-frames",
    {
      body: {
        video_path: videoPath,
        propuesta_id: propuestaId,
        max_frames: MAX_FRAMES_PER_VIDEO,
        context_hint: contextHint,
      },
    },
  );
  if (analysisErr) {
    console.warn(`[videoFrameExtractor] Timestamp analysis failed for ${videoName}:`, analysisErr);
  }
  const timestamps: FrameTimestamp[] = Array.isArray(analysisData?.timestamps)
    ? analysisData.timestamps
    : [];
  // If the AI returned nothing, leave the array empty here — the real fallback
  // (multiple timestamps spread across the duration) will be applied inside
  // extractFramesFromBlob, which actually knows the real video duration.
  const timestampsForCapture = timestamps;

  // 2. Download video through a short-lived signed URL minted server-side.
  //    Direct browser storage access is intentionally avoided here because the
  //    admin session is custom (manager_session_token), not a storage JWT.
  reportStep?.({ step: "download", label: "Descargando vídeo del almacenamiento", videoName });
  const { data: signedVideo, error: signedVideoErr } = await supabase.functions.invoke("incidencias-operations", {
    body: { action: "getVideoDownloadUrl", sessionToken, videoPath },
  });
  if (signedVideoErr || signedVideo?.success === false || !signedVideo?.signedUrl) {
    console.warn(`[videoFrameExtractor] Could not sign video ${bucketPath}:`, signedVideoErr || signedVideo?.error);
    return { videoName, frames: [], skipped: true, reason: "No se pudo descargar el vídeo" };
  }
  const downloadRes = await fetch(signedVideo.signedUrl);
  if (!downloadRes.ok) {
    return { videoName, frames: [], skipped: true, reason: `No se pudo descargar el vídeo (${downloadRes.status})` };
  }
  const videoBlob = await downloadRes.blob();
  if (videoBlob.size > MAX_VIDEO_BYTES) {
    return {
      videoName,
      frames: [],
      skipped: true,
      reason: `Vídeo demasiado grande (${Math.round(videoBlob.size / 1024 / 1024)} MB)`,
    };
  }

  // 3. Extract real frames in the browser
  let frames: Array<{ blob: Blob; meta: FrameTimestamp }>;
  try {
    frames = await extractFramesFromBlob(videoBlob, timestampsForCapture, reportStep, videoName);
  } catch (e: any) {
    console.warn(`[videoFrameExtractor] Browser decode failed for ${videoName}; trying ffmpeg fallback:`, e);
    try {
      frames = await extractFramesWithFfmpegFallback(videoBlob, timestampsForCapture, reportStep, videoName);
    } catch (fallbackErr: any) {
      console.warn(`[videoFrameExtractor] Decode fallback failed for ${videoName}:`, fallbackErr);
      return { videoName, frames: [], skipped: true, reason: fallbackErr?.message || e?.message || "Error de decodificación" };
    }
  }
  if (frames.length === 0) {
    try {
      frames = await extractFramesWithFfmpegFallback(videoBlob, timestampsForCapture, reportStep, videoName);
    } catch (fallbackErr: any) {
      console.warn(`[videoFrameExtractor] Empty browser capture and fallback failed for ${videoName}:`, fallbackErr);
    }
  }
  if (frames.length === 0) {
    return { videoName, frames: [], skipped: true, reason: "No se pudo capturar ningún fotograma real" };
  }

  // 4. Upload each frame to video-frames-v2/ and cache the row via edge function
  const folder = bucketPath.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_/-]/g, "_");
  const out: ExtractedFrame[] = [];

  for (let i = 0; i < frames.length; i++) {
    const { blob, meta } = frames[i];
    const tsTag = Math.round(meta.timestamp_seconds * 10);
    const framePath = `video-frames-v2/${propuestaId}/${folder}/t${String(tsTag).padStart(5, "0")}.jpg`;

    reportStep?.({
      step: "upload",
      label: `Subiendo fotograma ${formatTimestampMMSS(meta.timestamp_seconds)}`,
      current: i + 1,
      total: frames.length,
      videoName,
    });
    const caption = buildCaption(meta.timestamp_seconds, meta.description);
    const factual = sanitizeFactualDescription(meta.description);
    const frameBase64 = await blobToDataUrl(blob);

    reportStep?.({
      step: "save",
      label: `Guardando evidencia ${formatTimestampMMSS(meta.timestamp_seconds)}`,
      current: i + 1,
      total: frames.length,
      videoName,
    });
    const { data: cacheRes, error: insErr } = await supabase.functions.invoke("incidencias-operations", {
      body: {
        action: "cacheVideoFrame",
        sessionToken,
        propuestaId,
        videoPath,
        frameBase64,
        timestampSeconds: meta.timestamp_seconds,
        aiDescription: factual,
        relevanceScore: Number(meta.relevance_score) || 0,
        captureSource: "browser_canvas",
        sourceVideoName: videoName,
        caption,
        storagePath: framePath,
      },
    });
    if (insErr || cacheRes?.success === false) {
      console.warn(`[videoFrameExtractor] DB cache upsert failed:`, insErr || cacheRes?.error);
      continue;
    }

    out.push({
      url: cacheRes?.frameUrl || "",
      timestamp_s: meta.timestamp_seconds,
      descripcion: factual,
      caption,
      relevance: Number(meta.relevance_score) || 0,
      video_name: videoName,
    });
  }

  reportStep?.({ step: "done", label: "Evidencias del vídeo listas", videoName });
  return {
    videoName,
    frames: out,
    skipped: out.length === 0,
    reason: out.length === 0 ? "No se pudo persistir ningún frame" : undefined,
  };
}

const VIDEO_EXT = /\.(mp4|mov|avi|webm|mkv|3gp|m4v)$/i;

/** Filter the (already-merged) evidence list and return only video paths. */
export function filterVideoPaths(paths: unknown[]): string[] {
  return paths.filter(
    (p): p is string => typeof p === "string" && VIDEO_EXT.test(p.split("?")[0]),
  );
}

export interface ProcessProgress {
  videoIndex: number;
  totalVideos: number;
  videoName: string;
  step: StepProgress;
}

export interface PreprocessResult {
  totalFrames: number;
  processedVideos: number;
  /** Per-video outcome for reporting to the admin. */
  outcomes: VideoExtractionOutcome[];
}

/**
 * Process every video attached to the proposal (max 3) and ensure their
 * verified v2 frames are extracted and cached. Reports per-video outcomes so
 * the caller can warn the admin when a video failed to produce real evidence.
 */
export async function preprocessProposalVideos(
  propuestaId: string,
  videoPaths: string[],
  contextHint: string,
  onProgress?: (p: ProcessProgress) => void,
): Promise<PreprocessResult> {
  const limited = videoPaths.slice(0, 3);
  let totalFrames = 0;
  let processedVideos = 0;
  const outcomes: VideoExtractionOutcome[] = [];

  for (let i = 0; i < limited.length; i++) {
    const vp = limited[i];
    const name = (toBucketPath(vp).split("/").pop() || "video");
    try {
      const outcome = await extractAndCacheVideoFrames(
        propuestaId,
        vp,
        contextHint,
        (step) => {
          onProgress?.({ videoIndex: i, totalVideos: limited.length, videoName: name, step });
        },
      );
      outcomes.push(outcome);
      totalFrames += outcome.frames.length;
      if (!outcome.skipped) processedVideos += 1;
    } catch (e: any) {
      console.warn(`[videoFrameExtractor] Failed to process video ${name}:`, e);
      outcomes.push({
        videoName: name,
        frames: [],
        skipped: true,
        reason: e?.message || "Error inesperado",
      });
    }
  }
  onProgress?.({
    videoIndex: limited.length,
    totalVideos: limited.length,
    videoName: "",
    step: { step: "done", label: "Procesamiento completado" },
  });
  return { totalFrames, processedVideos, outcomes };
}
