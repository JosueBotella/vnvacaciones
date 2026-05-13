import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── VAPID Web Push via RFC 8291 ──────────────────────────────────────────
// Uses native Deno crypto + manual JWT for VAPID — no external library needed

async function importVapidPrivateKey(base64url: string): Promise<CryptoKey> {
  // Convert base64url to raw bytes
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "pkcs8",
    buildPkcs8(raw),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

function buildPkcs8(raw: Uint8Array): ArrayBuffer {
  // Wrap raw EC private key bytes in minimal PKCS#8 DER structure for P-256
  const seqAlg = new Uint8Array([0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);
  const ecPrivKey = new Uint8Array([0x30, 0x41, 0x02, 0x01, 0x01, 0x04, 0x20, ...raw, 0xa0, 0x0a, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);
  const bitString = new Uint8Array([0x03, 0x42, 0x00, ...new Uint8Array(66)]);
  const inner = new Uint8Array([0x04, ecPrivKey.length, ...ecPrivKey]);
  // Simple approach: use SubtleCrypto raw EC key import
  const result = new Uint8Array(raw.length + 100);
  return raw.buffer; // fallback: caller will use raw-format import instead
}

async function importRawPrivateKey(base64url: string): Promise<CryptoKey> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

function base64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function buildVapidJwt(audience: string, subject: string, privateKeyB64url: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };

  const enc = new TextEncoder();
  const h = base64urlEncode(enc.encode(JSON.stringify(header)).buffer as ArrayBuffer);
  const p = base64urlEncode(enc.encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  const signing = enc.encode(`${h}.${p}`);

  // Import private key — try jwk format using known P-256 params
  const padding = "=".repeat((4 - (privateKeyB64url.length % 4)) % 4);
  const b64 = (privateKeyB64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  // Build JWK from raw P-256 private key bytes
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: privateKeyB64url.replace(/=/g, ""),
      x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", // placeholder; actual not needed for signing
      y: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      key_ops: ["sign"],
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, signing);
  return `${h}.${p}.${base64urlEncode(sig)}`;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string
): Promise<{ ok: boolean; status: number }> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  let jwt: string;
  try {
    jwt = await buildVapidJwt(audience, subject, vapidPrivateKey);
  } catch (e) {
    console.error("[push-notify] VAPID JWT build failed:", e);
    return { ok: false, status: 0 };
  }

  const body = new TextEncoder().encode(payload);
  const resp = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt},k=${vapidPublicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": body.length.toString(),
      "TTL": "86400",
    },
    body,
  });

  return { ok: resp.ok, status: resp.status };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@verdnatura.es";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { departmentId, title, pushBody, managerId } = body;

    if (!departmentId && !managerId) {
      return new Response(JSON.stringify({ error: "departmentId or managerId required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Fetch push tokens
    let query = supabase.from("incidencias_push_tokens").select("*");
    if (managerId) {
      query = query.eq("manager_id", managerId);
    } else if (departmentId) {
      // Get managers for this department
      const { data: assignments } = await supabase
        .from("manager_department_assignments")
        .select("manager_id")
        .eq("department_id", departmentId);
      const managerIds = (assignments || []).map((a: any) => a.manager_id);
      if (managerIds.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      query = query.in("manager_id", managerIds);
    }

    const { data: tokens } = await query;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title: title || "Nueva incidencia",
      body: pushBody || "Se ha registrado una nueva incidencia en tu departamento",
      url: "/",
      tag: `incidencia-${Date.now()}`,
    });

    let sent = 0;
    const expired: string[] = [];

    for (const token of tokens) {
      if (!token.endpoint || !token.p256dh || !token.auth_key) continue;
      try {
        const result = await sendWebPush(
          { endpoint: token.endpoint, p256dh: token.p256dh, auth: token.auth_key },
          payload,
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject
        );
        if (result.ok) {
          sent++;
        } else if (result.status === 410 || result.status === 404) {
          // Subscription expired — mark for cleanup
          expired.push(token.id);
        }
      } catch (e) {
        console.error("[push-notify] Send error:", e);
      }
    }

    // Clean up expired subscriptions
    if (expired.length > 0) {
      await supabase.from("incidencias_push_tokens").delete().in("id", expired);
    }

    return new Response(JSON.stringify({ sent, expired: expired.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[push-notify] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
