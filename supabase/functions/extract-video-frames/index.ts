// Analyze a video evidence and return ONLY probative timestamps + textual descriptions.
//
// HARD GUARANTEE: This function NEVER returns image bytes, image URLs or any
// AI-generated visual reconstruction. Real frames are extracted on the CLIENT
// (admin browser) using <video> + canvas — see src/lib/videoFrameExtractor.ts.
// Any consumer of this endpoint MUST treat the response as text-only metadata
// (timestamp + factual description). Frames inserted into legal documents
// must come exclusively from the verified `video-frames-v2/` storage path
// produced by the browser extractor.
//
// Input:  { video_path, propuesta_id, max_frames? (capped at 3), context_hint? }
// Output: { timestamps: [{ timestamp_seconds, description, relevance_score }], notice }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
// Hard ceiling. We stream from Storage → Gemini without buffering in RAM,
// so this only protects against absurdly large inputs / runaway uploads.
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB
const DEFAULT_MAX_FRAMES = 3;
const HARD_MAX_FRAMES = 3; // never return more than 3 timestamps — the document only shows fundamental moments.

interface FrameAnalysis {
  timestamp_seconds: number;
  description: string;
  relevance_score: number;
}

function inferMimeType(path: string): string {
  const ext = path.toLowerCase().split(".").pop() || "";
  switch (ext) {
    case "mp4":
    case "m4v": return "video/mp4";
    case "mov": return "video/quicktime";
    case "webm": return "video/webm";
    case "avi": return "video/x-msvideo";
    case "mkv": return "video/x-matroska";
    case "3gp": return "video/3gpp";
    default: return "video/mp4";
  }
}

async function uploadVideoToGeminiFilesStreaming(
  apiKey: string,
  videoStream: ReadableStream<Uint8Array>,
  contentLength: number,
  mimeType: string,
  displayName: string,
): Promise<{ fileUri: string; fileName: string }> {
  const startRes = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(contentLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!startRes.ok) {
    throw new Error(`Gemini upload start failed: ${startRes.status} ${await startRes.text()}`);
  }
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("Gemini upload URL missing");

  // Stream the bytes directly from Storage → Gemini (no in-memory copy).
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Length": String(contentLength),
      "Content-Type": mimeType,
    },
    body: videoStream,
    // @ts-ignore — Deno fetch supports duplex for streaming request bodies
    duplex: "half",
  });
  if (!uploadRes.ok) {
    throw new Error(`Gemini upload finalize failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const fileMeta = await uploadRes.json();
  const fileUri = fileMeta?.file?.uri;
  const fileName = fileMeta?.file?.name;
  if (!fileUri || !fileName) throw new Error("Gemini file URI missing in response");

  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusRes = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status?.state === "ACTIVE") break;
    if (status?.state === "FAILED") throw new Error("Gemini file processing failed");
  }

  return { fileUri, fileName };
}

async function analyzeVideoForFrames(
  apiKey: string,
  fileUri: string,
  mimeType: string,
  maxFrames: number,
  contextHint: string,
): Promise<FrameAnalysis[]> {
  const prompt = `Eres un perito disciplinario analizando un vídeo aportado como prueba en un expediente laboral.

CONTEXTO DE LA INCIDENCIA:
${contextHint || "(no proporcionado)"}

TAREA:
Analiza el vídeo COMPLETO de principio a fin. Identifica los ${maxFrames} momentos VISUALES MÁS PROBATORIOS que demuestren la conducta descrita. Para cada momento devuelve:
- timestamp_seconds: instante exacto en segundos (entero o decimal con 1 cifra). DEBE estar dentro de la duración real del vídeo.
- description: descripción FACTUAL y BREVE (1-2 frases) de qué se observa exactamente en ese instante. Sé objetivo, sin valoraciones, en tercera persona, en español neutro y formal. NUNCA uses palabras como "plantas", "flores", "rosas" o nombres de especies — usa "material", "mercancía" o "artículos".
- relevance_score: 0 a 10 indicando lo probatorio que es ese momento (10 = momento clave).

REGLAS:
- Devuelve MÁXIMO ${maxFrames} momentos, mínimo 1.
- Distribuye los timestamps a lo largo del vídeo (no todos al inicio).
- Si el vídeo es muy corto (< 5s), devuelve 1-2 timestamps.
- Si no se observa nada relevante, devuelve un único momento del centro del vídeo con relevance_score bajo y la descripción explicando la falta de evidencia.`;

  const body = {
    contents: [{
      role: "user",
      parts: [
        { fileData: { fileUri, mimeType } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          frames: {
            type: "array",
            items: {
              type: "object",
              properties: {
                timestamp_seconds: { type: "number" },
                description: { type: "string" },
                relevance_score: { type: "integer" },
              },
              required: ["timestamp_seconds", "description", "relevance_score"],
            },
          },
        },
        required: ["frames"],
      },
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini analysis failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOut) return [];
  try {
    const parsed = JSON.parse(textOut);
    const frames: FrameAnalysis[] = Array.isArray(parsed?.frames) ? parsed.frames : [];
    return frames
      .filter((f) => Number.isFinite(f.timestamp_seconds) && f.description?.trim())
      .slice(0, maxFrames);
  } catch (e) {
    console.error("Failed to parse Gemini frame analysis JSON:", e, textOut);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_AI_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing GOOGLE_AI_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const videoPath: string = body?.video_path;
    const maxFrames: number = Math.min(Math.max(Number(body?.max_frames) || DEFAULT_MAX_FRAMES, 1), HARD_MAX_FRAMES);
    const contextHint: string = body?.context_hint || "";

    if (!videoPath) {
      return new Response(JSON.stringify({ error: "video_path is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize storage path
    const cleanPath = (() => {
      const m = videoPath.match(/incidencias-pruebas\/([^?]+)/);
      return m ? decodeURIComponent(m[1]) : videoPath;
    })();

    // Generate a short-lived signed URL so we can stream the video directly
    // from Storage to Gemini without buffering it in the Edge Function's RAM.
    const { data: signed, error: signErr } = await supabase.storage
      .from("incidencias-pruebas")
      .createSignedUrl(cleanPath, 60 * 10); // 10 min
    if (signErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: `Could not sign video: ${signErr?.message}` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // HEAD to learn the content length without downloading the body.
    const headRes = await fetch(signed.signedUrl, { method: "HEAD" });
    if (!headRes.ok) {
      return new Response(JSON.stringify({ error: `HEAD failed: ${headRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const contentLength = Number(headRes.headers.get("content-length") || "0");
    if (!contentLength) {
      return new Response(JSON.stringify({ error: "Unknown video size" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (contentLength > MAX_VIDEO_BYTES) {
      return new Response(
        JSON.stringify({
          timestamps: [],
          skipped: true,
          reason: `Video exceeds ${MAX_VIDEO_BYTES} bytes (${contentLength} B)`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mimeType = inferMimeType(cleanPath);
    const baseName = cleanPath.split("/").pop() || "video";

    // Stream video bytes Storage → Gemini (no in-memory buffering).
    const getRes = await fetch(signed.signedUrl, { method: "GET" });
    if (!getRes.ok || !getRes.body) {
      return new Response(JSON.stringify({ error: `GET failed: ${getRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[analyze-video-timestamps] Streaming ${baseName} (${contentLength} B) to Gemini`);
    const { fileUri, fileName } = await uploadVideoToGeminiFilesStreaming(
      apiKey,
      getRes.body,
      contentLength,
      mimeType,
      baseName,
    );

    console.log(`[analyze-video-timestamps] Analyzing video for ${maxFrames} relevant timestamps`);
    const analysis = await analyzeVideoForFrames(apiKey, fileUri, mimeType, maxFrames, contextHint);

    // Best-effort cleanup of the temp Gemini file
    try {
      await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`, { method: "DELETE" });
    } catch { /* ignore */ }

    console.log(`[analyze-video-timestamps] Returned ${analysis.length} timestamps for ${baseName}`);
    return new Response(
      JSON.stringify({
        timestamps: analysis,
        video_name: baseName,
        notice: "Text-only response. Real frames must be captured client-side from the original video.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[analyze-video-timestamps] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), timestamps: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
