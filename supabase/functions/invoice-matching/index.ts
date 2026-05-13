import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, ...params } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    switch (action) {
      case "extractSupplierInfo":
        return await handleExtractSupplierInfo(params, supabase);
      case "extractProducts":
        return await handleExtractProducts(params, supabase);
      case "matchProducts":
        return await handleMatchProducts(params, supabase);
      case "saveMapping":
        return await handleSaveMapping(params, supabase);
      case "deleteMapping":
        return await handleDeleteMapping(params, supabase);
      case "getMappings":
        return await handleGetMappings(params, supabase);
      case "getSuppliers":
        return await handleGetSuppliers(supabase);
      case "getSupplierCard":
        return await handleGetSupplierCard(params, supabase);
      case "updateSupplierNotes":
        return await handleUpdateSupplierNotes(params, supabase);
      case "deleteAiLearning":
        return await handleDeleteAiLearning(params, supabase);
      case "getChatMessages":
        return await handleGetChatMessages(params, supabase);
      case "sendChatMessage":
        return await handleSendChatMessage(params, supabase);
      case "deleteChatMessage":
        return await handleDeleteChatMessage(params, supabase);
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("invoice-matching error:", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Helper: download PDF from storage and return base64 ──
async function getPdfBase64FromStorage(storagePath: string, supabase: any): Promise<string> {
  const { data, error } = await supabase.storage.from("invoice-pdfs").download(storagePath);
  if (error || !data) throw new Error(`Error descargando PDF: ${error?.message || "archivo no encontrado"}`);
  const arrayBuffer = await data.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

// ── Resolve pdfBase64: from storage path or inline ──
async function resolvePdfBase64(params: any, supabase: any): Promise<string> {
  if (params.storagePath) {
    return await getPdfBase64FromStorage(params.storagePath, supabase);
  }
  if (params.pdfBase64) {
    return params.pdfBase64;
  }
  throw new Error("No se proporcionó PDF (ni storagePath ni pdfBase64)");
}

// ── Extract supplier info from internal PDF ──
async function handleExtractSupplierInfo(params: any, supabase: any) {
  const pdfBase64 = await resolvePdfBase64(params, supabase);
  const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY not configured");

  const prompt = `Analiza este PDF que es un programa interno de entradas de mercancía.
Busca la sección "Datos del proveedor" o similar y extrae:
- El nombre del proveedor
- CIF/NIF si aparece
- Cualquier dato identificativo

Devuelve SOLO un JSON con este formato exacto:
{
  "supplierName": "nombre del proveedor",
  "cif": "CIF o null",
  "address": "dirección o null"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" }
      })
    }
  );

  if (!response.ok) throw new Error("Error al analizar el PDF");

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  try {
    const info = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
    return json(info);
  } catch {
    return json({ supplierName: null, cif: null, address: null });
  }
}

// ── Extract products from PDF using Gemini ──
async function handleExtractProducts(params: any, supabase: any) {
  const pdfBase64 = await resolvePdfBase64(params, supabase);
  const docType = params.docType || "internal";
  const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY not configured");

  const typeLabel = docType === "internal" ? "programa interno de entradas" : "factura del proveedor";

  const prompt = `Analiza este PDF que es un ${typeLabel}. Extrae TODOS los productos/artículos que aparecen con sus cantidades y precios.

Devuelve SOLO un JSON array con objetos de este formato exacto:
[
  {
    "nombre": "nombre del producto tal como aparece",
    "cantidad_total_stems": 123,
    "unidad_original": "bunches/stems/kg/uds/cajas/etc",
    "cantidad_original": 10,
    "stems_por_unidad": 12,
    "referencia": "código o referencia si aparece, null si no",
    "precio_unitario": 1.23,
    "precio_unidad": "per_stem/per_bunch/per_box/per_kg/per_unit/unknown",
    "altura": 60
  }
]

REGLAS CRÍTICAS PARA CANTIDADES:
- El campo "cantidad_total_stems" SIEMPRE debe contener el número TOTAL de TALLOS INDIVIDUALES (stems).
- Si el documento muestra "bunches" (ramos), DEBES multiplicar: bunches × stems_per_bunch = cantidad_total_stems.
  Ejemplo: 10 bunches × 12 stems = cantidad_total_stems: 120
- Si el documento muestra directamente stems/tallos, usa ese número como cantidad_total_stems.
- Si el documento tiene una columna "Total stems" o similar, usa ESE valor como cantidad_total_stems.
- "cantidad_original" es el número tal como aparece en el documento (ej: 10 bunches → cantidad_original: 10).
- "unidad_original" es la unidad tal como aparece (bunches, stems, kg, etc).
- "stems_por_unidad" es cuántos tallos tiene cada unidad (ej: 12 si son bunches de 12). Si ya son stems, pon 1.
- Para productos que NO son flores (ej: cajas, kg), pon cantidad_total_stems = cantidad_original y stems_por_unidad = 1.

REGLAS CRÍTICAS PARA PRECIOS:
- "precio_unitario": el precio numérico tal como aparece en el documento. Si no hay precio, pon null.
- "precio_unidad": la unidad a la que se refiere ese precio:
  - "per_stem" si el precio es por tallo individual
  - "per_bunch" si el precio es por ramo/bunch
  - "per_box" si el precio es por caja
  - "per_kg" si el precio es por kilogramo
  - "per_unit" si el precio es por unidad genérica
  - "unknown" si no puedes determinar la unidad del precio
- ANALIZA el contexto para deducir la unidad del precio:
  - Si la columna dice "Price/bunch" o el total = precio × bunches → "per_bunch"
  - Si la columna dice "Price/stem" o el total = precio × stems → "per_stem"
  - Si las cantidades están en bunches y el total cuadra con precio × bunches → "per_bunch"
  - Si las cantidades están en stems y el total cuadra con precio × stems → "per_stem"

REGLAS PARA ALTURA:
- "altura": la altura del producto en centímetros si aparece en el documento (ej: 60, 70, 80). Si no aparece, pon null.
- Busca indicaciones como "60cm", "H60", "alt. 60", o la altura incluida en el nombre del producto.

IMPORTANTE:
- Extrae TODOS los productos, no te dejes ninguno
- Las cantidades y precios deben ser números (no strings)
- Si hay varias líneas del mismo producto con distinta cantidad, ponlas como líneas separadas
- Devuelve SOLO el JSON, sin markdown ni explicaciones`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 65536, responseMimeType: "application/json" }
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini error:", errText);
    throw new Error("Error al procesar el PDF con IA");
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

  try {
    const products = JSON.parse(cleaned);
    return json({ products: Array.isArray(products) ? products : [] });
  } catch {
    console.error("Failed to parse AI response. Length:", text.length, "First 500:", text.substring(0, 500));
    throw new Error("La IA no pudo extraer productos del PDF. Intenta con un PDF más claro.");
  }
}

// ── Normalize price to per-stem ──
function getPricePerStem(product: any): number | null {
  if (product.precio_unitario == null) return null;
  const price = Number(product.precio_unitario);
  if (isNaN(price)) return null;

  const unit = product.precio_unidad || "unknown";
  const stemsPerUnit = product.stems_por_unidad || 1;

  switch (unit) {
    case "per_stem":
      return price;
    case "per_bunch":
      return stemsPerUnit > 1 ? price / stemsPerUnit : price;
    case "per_box":
      // If we know stems per box (cantidad_total_stems / cantidad_original gives stems per box)
      const stemsPerBox = product.cantidad_total_stems && product.cantidad_original
        ? product.cantidad_total_stems / product.cantidad_original
        : stemsPerUnit;
      return stemsPerBox > 0 ? price / stemsPerBox : price;
    case "per_unit":
      return stemsPerUnit > 1 ? price / stemsPerUnit : price;
    default:
      // Unknown: assume it's per the original unit, normalize by stems_por_unidad
      return stemsPerUnit > 1 ? price / stemsPerUnit : price;
  }
}

// ── Match products using AI with supplier context ──
async function handleMatchProducts(
  { internalProducts, supplierProducts, supplierName }: any,
  supabase: any
) {
  // Load saved mappings
  const { data: mappings } = await supabase
    .from("invoice_product_mappings")
    .select("*")
    .eq("supplier_name", supplierName);

  // Load supplier card with learnings
  const { data: supplierCard } = await supabase
    .from("invoice_suppliers")
    .select("*")
    .eq("name", supplierName)
    .maybeSingle();

  const aiLearnings = supplierCard?.ai_learnings || [];
  const productCatalog = supplierCard?.product_catalog || [];

  const mappingMap = new Map<string, string>();
  (mappings || []).forEach((m: any) => {
    mappingMap.set(normalize(m.supplier_product_name), m.internal_product_name);
  });

  const matched: any[] = [];
  const usedInternal = new Set<number>();
  const usedSupplier = new Set<number>();

  // Phase 1: Match by saved mappings
  for (let si = 0; si < supplierProducts.length; si++) {
    const sp = supplierProducts[si];
    const mappedName = mappingMap.get(normalize(sp.nombre));
    if (!mappedName) continue;

    const ii = internalProducts.findIndex((ip: any, idx: number) =>
      !usedInternal.has(idx) && normalize(ip.nombre) === normalize(mappedName)
    );
    if (ii >= 0) {
      const ip = internalProducts[ii];
      matched.push({
        internalProduct: ip,
        supplierProduct: sp,
        matchType: "mapping",
        quantityMatch: getStems(ip) === getStems(sp),
        heightMatch: getHeightMatch(ip, sp),
        ...buildPriceMatch(ip, sp),
      });
      usedInternal.add(ii);
      usedSupplier.add(si);
    }
  }

  // Phase 2: Fuzzy match by normalized name
  for (let si = 0; si < supplierProducts.length; si++) {
    if (usedSupplier.has(si)) continue;
    const sp = supplierProducts[si];
    const spNorm = normalize(sp.nombre);

    for (let ii = 0; ii < internalProducts.length; ii++) {
      if (usedInternal.has(ii)) continue;
      const ip = internalProducts[ii];
      const ipNorm = normalize(ip.nombre);

      if (spNorm === ipNorm || spNorm.includes(ipNorm) || ipNorm.includes(spNorm)) {
        matched.push({
          internalProduct: ip,
          supplierProduct: sp,
          matchType: "fuzzy",
          quantityMatch: getStems(ip) === getStems(sp),
          heightMatch: getHeightMatch(ip, sp),
          ...buildPriceMatch(ip, sp),
        });
        usedInternal.add(ii);
        usedSupplier.add(si);
        break;
      }
    }
  }

  // Phase 3: AI-powered matching for remaining unmatched items
  const remainingInternal = internalProducts.filter((_: any, i: number) => !usedInternal.has(i));
  const remainingSupplier = supplierProducts.filter((_: any, i: number) => !usedSupplier.has(i));

  if (remainingInternal.length > 0 && remainingSupplier.length > 0) {
    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (GOOGLE_AI_API_KEY) {
      try {
        const learningsContext = aiLearnings.length > 0
          ? `\n\nLECCIONES APRENDIDAS de comparaciones anteriores con este proveedor:\n${aiLearnings.map((l: any) => `- ${l.lesson}`).join("\n")}`
          : "";

        const mappingsContext = (mappings || []).length > 0
          ? `\n\nMAPEOS GUARDADOS para este proveedor:\n${(mappings || []).map((m: any) => `- "${m.supplier_product_name}" = "${m.internal_product_name}"`).join("\n")}`
          : "";

        const catalogContext = productCatalog.length > 0
          ? `\n\nCATÁLOGO CONOCIDO del proveedor:\n${productCatalog.map((p: any) => `- ${p}`).join("\n")}`
          : "";

        // Load user chat instructions for this supplier
        const { data: chatMsgs } = await supabase
          .from("invoice_supplier_chat_messages")
          .select("role, content")
          .eq("supplier_name", supplierName)
          .eq("role", "user")
          .order("created_at", { ascending: true });

        const chatContext = (chatMsgs || []).length > 0
          ? `\n\nINSTRUCCIONES DEL USUARIO para este proveedor (reglas dadas por chat, APLÍCALAS SIEMPRE):\n${(chatMsgs || []).map((m: any) => `- "${m.content}"`).join("\n")}`
          : "";

        const aiMatchPrompt = `Eres un experto en matching de productos de un mayorista de flores y plantas.

Tienes dos listas de productos que NO han sido emparejados por nombre directo. Tu trabajo es encontrar coincidencias entre productos del proveedor y productos internos que se refieren al MISMO producto pero con nombres diferentes.
${learningsContext}${mappingsContext}${catalogContext}${chatContext}

PRODUCTOS INTERNOS sin emparejar:
${remainingInternal.map((p: any, i: number) => `[${i}] ${p.nombre} (${getStems(p)} stems total)`).join("\n")}

PRODUCTOS DEL PROVEEDOR sin emparejar:
${remainingSupplier.map((p: any, i: number) => `[${i}] ${p.nombre} (${getStems(p)} stems total)`).join("\n")}

Empareja los productos que creas que son el MISMO artículo. Ten en cuenta que los nombres pueden estar en distintos idiomas, usar abreviaciones, o formatos diferentes.

Devuelve un JSON array con los emparejamientos encontrados:
[{"internalIdx": 0, "supplierIdx": 2, "confidence": "high|medium"}]

Solo incluye matches con confianza medium o high. Si no hay matches, devuelve [].`;

        const aiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: aiMatchPrompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" }
            })
          }
        );

        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          const aiText = aiResult.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          const aiMatches = JSON.parse(aiText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));

          const aiUsedInternal = new Set<number>();
          const aiUsedSupplier = new Set<number>();

          for (const am of aiMatches) {
            if (aiUsedInternal.has(am.internalIdx) || aiUsedSupplier.has(am.supplierIdx)) continue;
            if (am.internalIdx >= remainingInternal.length || am.supplierIdx >= remainingSupplier.length) continue;

            const ip = remainingInternal[am.internalIdx];
            const sp = remainingSupplier[am.supplierIdx];

            matched.push({
              internalProduct: ip,
              supplierProduct: sp,
              matchType: "ai",
              quantityMatch: getStems(ip) === getStems(sp),
              heightMatch: getHeightMatch(ip, sp),
              confidence: am.confidence,
              ...buildPriceMatch(ip, sp),
            });

            aiUsedInternal.add(am.internalIdx);
            aiUsedSupplier.add(am.supplierIdx);

            const globalIi = internalProducts.indexOf(ip);
            const globalSi = supplierProducts.indexOf(sp);
            if (globalIi >= 0) usedInternal.add(globalIi);
            if (globalSi >= 0) usedSupplier.add(globalSi);
          }
        }
      } catch (e) {
        console.error("AI matching phase failed (non-fatal):", e);
      }
    }
  }

  const onlyInternal = internalProducts.filter((_: any, i: number) => !usedInternal.has(i));
  const onlySupplier = supplierProducts.filter((_: any, i: number) => !usedSupplier.has(i));

  // Ensure/update supplier card
  await ensureSupplierCard(supabase, supplierName, internalProducts, supplierProducts);

  // Save comparison history
  await supabase.from("invoice_comparisons").insert({
    supplier_name: supplierName,
    result_summary: {
      total_matched: matched.length,
      quantity_discrepancies: matched.filter((m: any) => !m.quantityMatch).length,
      height_discrepancies: matched.filter((m: any) => m.heightMatch === false).length,
      price_discrepancies: matched.filter((m: any) => m.priceMatch === false).length,
      only_internal: onlyInternal.length,
      only_supplier: onlySupplier.length,
    },
  });

  // AUTO-LEARN: save all fuzzy + AI matches as mappings for next time
  const newMappings: { supplier_name: string; supplier_product_name: string; internal_product_name: string }[] = [];
  for (const m of matched) {
    if (m.matchType === "fuzzy" || m.matchType === "ai") {
      const spNorm = normalize(m.supplierProduct.nombre);
      // Only save if not already a saved mapping
      if (!mappingMap.has(spNorm)) {
        newMappings.push({
          supplier_name: supplierName,
          supplier_product_name: m.supplierProduct.nombre,
          internal_product_name: m.internalProduct.nombre,
        });
      }
    }
  }
  if (newMappings.length > 0) {
    // Upsert to avoid duplicates
    for (const nm of newMappings) {
      await supabase.from("invoice_product_mappings").upsert(
        nm,
        { onConflict: "supplier_name,supplier_product_name" }
      );
    }
    console.log(`Auto-learned ${newMappings.length} new mappings for "${supplierName}"`);
  }

  return json({ matched, onlyInternal, onlySupplier });
}

// ── Build price match info for a matched pair ──
function buildPriceMatch(ip: any, sp: any) {
  const internalPricePerStem = getPricePerStem(ip);
  const supplierPricePerStem = getPricePerStem(sp);

  if (internalPricePerStem == null || supplierPricePerStem == null) {
    return {
      internalPricePerStem: internalPricePerStem,
      supplierPricePerStem: supplierPricePerStem,
      priceMatch: null, // Can't compare if one is missing
    };
  }

  // Tolerance: prices match if within 1% or 0.005 absolute
  const diff = Math.abs(internalPricePerStem - supplierPricePerStem);
  const avg = (internalPricePerStem + supplierPricePerStem) / 2;
  const priceMatch = diff < 0.005 || (avg > 0 && diff / avg < 0.01);

  return {
    internalPricePerStem: Math.round(internalPricePerStem * 10000) / 10000,
    supplierPricePerStem: Math.round(supplierPricePerStem * 10000) / 10000,
    priceMatch,
  };
}

// ── Ensure supplier card exists and update stats ──
async function ensureSupplierCard(supabase: any, supplierName: string, internalProducts: any[], supplierProducts: any[]) {
  const { data: existing } = await supabase
    .from("invoice_suppliers")
    .select("id, product_catalog, total_comparisons")
    .eq("name", supplierName)
    .maybeSingle();

  const newProducts = supplierProducts.map((p: any) => p.nombre);
  const existingCatalog: string[] = existing?.product_catalog || [];
  const mergedCatalog = [...new Set([...existingCatalog, ...newProducts])];

  if (existing) {
    await supabase.from("invoice_suppliers").update({
      product_catalog: mergedCatalog,
      total_comparisons: (existing.total_comparisons || 0) + 1,
      last_comparison_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await supabase.from("invoice_suppliers").insert({
      name: supplierName,
      product_catalog: mergedCatalog,
      total_comparisons: 1,
      last_comparison_at: new Date().toISOString(),
    });
  }
}

// ── Save mapping + add AI learning ──
async function handleSaveMapping({ supplierName, supplierProductName, internalProductName }: any, supabase: any) {
  const { error } = await supabase.from("invoice_product_mappings").upsert(
    { supplier_name: supplierName, supplier_product_name: supplierProductName, internal_product_name: internalProductName },
    { onConflict: "supplier_name,supplier_product_name" }
  );
  if (error) throw new Error(error.message);

  const { data: supplier } = await supabase
    .from("invoice_suppliers")
    .select("id, ai_learnings")
    .eq("name", supplierName)
    .maybeSingle();

  if (supplier) {
    const learnings = supplier.ai_learnings || [];
    learnings.push({
      date: new Date().toISOString().slice(0, 10),
      lesson: `El proveedor usa "${supplierProductName}" para referirse a "${internalProductName}". Siempre mapear estos dos productos.`,
    });
    await supabase.from("invoice_suppliers").update({
      ai_learnings: learnings,
      updated_at: new Date().toISOString(),
    }).eq("id", supplier.id);
  }

  return json({ success: true });
}

// ── Delete a mapping ──
async function handleDeleteMapping({ id }: any, supabase: any) {
  const { error } = await supabase.from("invoice_product_mappings").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ success: true });
}

// ── Get mappings for a supplier ──
async function handleGetMappings({ supplierName }: any, supabase: any) {
  const { data, error } = await supabase
    .from("invoice_product_mappings")
    .select("*")
    .eq("supplier_name", supplierName)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return json({ mappings: data });
}

// ── List all known suppliers ──
async function handleGetSuppliers(supabase: any) {
  const { data, error } = await supabase
    .from("invoice_suppliers")
    .select("id, name, total_comparisons, last_comparison_at")
    .order("name");
  if (error) throw new Error(error.message);
  return json({ suppliers: data || [] });
}

// ── Get full supplier card ──
async function handleGetSupplierCard({ supplierName }: any, supabase: any) {
  const { data } = await supabase
    .from("invoice_suppliers")
    .select("*")
    .eq("name", supplierName)
    .maybeSingle();
  return json({ supplier: data });
}

// ── Update supplier notes ──
async function handleUpdateSupplierNotes({ supplierName, notes }: any, supabase: any) {
  const { error } = await supabase
    .from("invoice_suppliers")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("name", supplierName);
  if (error) throw new Error(error.message);
  return json({ success: true });
}

// ── Delete a specific AI learning entry ──
async function handleDeleteAiLearning({ supplierName, learningIndex }: any, supabase: any) {
  const { data: supplier } = await supabase
    .from("invoice_suppliers")
    .select("id, ai_learnings")
    .eq("name", supplierName)
    .maybeSingle();

  if (!supplier) throw new Error("Proveedor no encontrado");

  const learnings = [...(supplier.ai_learnings || [])];
  learnings.splice(learningIndex, 1);

  await supabase.from("invoice_suppliers").update({
    ai_learnings: learnings,
    updated_at: new Date().toISOString(),
  }).eq("id", supplier.id);

  return json({ success: true });
}

// ── Get chat messages for a supplier ──
async function handleGetChatMessages({ supplierName }: any, supabase: any) {
  const { data, error } = await supabase
    .from("invoice_supplier_chat_messages")
    .select("*")
    .eq("supplier_name", supplierName)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return json({ messages: data || [] });
}

// ── Send chat message and get AI response ──
async function handleSendChatMessage({ supplierName, message }: any, supabase: any) {
  // Save user message
  const { error: userInsertError } = await supabase.from("invoice_supplier_chat_messages").insert({
    supplier_name: supplierName,
    role: "user",
    content: message,
  });
  if (userInsertError) throw new Error(userInsertError.message);

  // Load full context for the AI
  const { data: chatHistory } = await supabase
    .from("invoice_supplier_chat_messages")
    .select("role, content")
    .eq("supplier_name", supplierName)
    .order("created_at", { ascending: true });

  const { data: supplierCard } = await supabase
    .from("invoice_suppliers")
    .select("*")
    .eq("name", supplierName)
    .maybeSingle();

  const { data: mappings } = await supabase
    .from("invoice_product_mappings")
    .select("supplier_product_name, internal_product_name")
    .eq("supplier_name", supplierName);

  const aiLearnings = supplierCard?.ai_learnings || [];
  const productCatalog = supplierCard?.product_catalog || [];

  const systemPrompt = `Eres el asistente experto de cuadre de facturas para el proveedor "${supplierName}".
Tu rol es ayudar al usuario a configurar reglas y resolver dudas sobre cómo este proveedor factura, nombra productos, usa unidades de medida, etc.

CONTEXTO DEL PROVEEDOR:
${mappings && mappings.length > 0 ? `\nMapeos guardados (nombre proveedor → nombre interno):\n${mappings.map((m: any) => `- "${m.supplier_product_name}" → "${m.internal_product_name}"`).join("\n")}` : "\nNo hay mapeos guardados aún."}
${aiLearnings.length > 0 ? `\nLecciones aprendidas:\n${aiLearnings.map((l: any) => `- ${l.lesson}`).join("\n")}` : ""}
${productCatalog.length > 0 ? `\nProductos conocidos del proveedor:\n${productCatalog.slice(0, 50).join(", ")}` : ""}
${supplierCard?.notes ? `\nNotas del usuario:\n${supplierCard.notes}` : ""}

INSTRUCCIONES:
- Responde siempre en español.
- Si el usuario te da una regla o corrección, confírmala y explica cómo la aplicarás.
- Todas las instrucciones que el usuario te dé aquí se usarán automáticamente en futuras comparaciones de facturas.
- Sé conciso pero útil.`;

  // Build Gemini contents (no system role — use systemInstruction)
  const contents: any[] = [];
  for (const m of (chatHistory || [])) {
    const geminiRole = m.role === "assistant" ? "model" : "user";
    // Gemini requires alternating roles — merge consecutive same-role messages
    if (contents.length > 0 && contents[contents.length - 1].role === geminiRole) {
      contents[contents.length - 1].parts.push({ text: m.content });
    } else {
      contents.push({ role: geminiRole, parts: [{ text: m.content }] });
    }
  }

  // Ensure conversation starts with "user" role (Gemini requirement)
  if (contents.length === 0 || contents[0].role !== "user") {
    contents.unshift({ role: "user", parts: [{ text: "Hola" }] });
  }

  const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY not configured");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini chat error:", errText);

    if (response.status === 429) {
      const retryAfterSeconds = extractRetryAfterSeconds(response, errText);
      const fallbackReply = retryAfterSeconds
        ? `Ahora mismo la IA está temporalmente saturada para este chat. Espera ~${retryAfterSeconds}s y vuelve a intentarlo.`
        : "Ahora mismo la IA está temporalmente saturada para este chat. Espera unos segundos y vuelve a intentarlo.";

      // Guardamos respuesta asistente de fallback para evitar error 500 en cliente
      await supabase.from("invoice_supplier_chat_messages").insert({
        supplier_name: supplierName,
        role: "assistant",
        content: fallbackReply,
      });

      return json({ reply: fallbackReply, rateLimited: true, retryAfterSeconds: retryAfterSeconds ?? null });
    }

    throw new Error("Error al comunicar con la IA");
  }

  const result = await response.json();
  const aiReply = result.candidates?.[0]?.content?.parts?.[0]?.text || "No pude generar una respuesta.";

  // Save assistant message
  await supabase.from("invoice_supplier_chat_messages").insert({
    supplier_name: supplierName,
    role: "assistant",
    content: aiReply,
  });

  return json({ reply: aiReply });
}

// ── Delete a chat message ──
async function handleDeleteChatMessage({ id }: any, supabase: any) {
  const { error } = await supabase.from("invoice_supplier_chat_messages").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ success: true });
}

function extractRetryAfterSeconds(response: Response, errText: string): number | null {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const parsed = Number(retryAfter);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }

  try {
    const payload = JSON.parse(errText);
    const details = payload?.error?.details;
    if (Array.isArray(details)) {
      for (const detail of details) {
        const retryDelay = detail?.metadata?.retryDelay || detail?.retryDelay;
        if (typeof retryDelay === "string") {
          const match = retryDelay.match(/(\d+)s/i);
          if (match) return Number(match[1]);
        }
      }
    }
  } catch {
    // ignore parse errors and fallback to generic message
  }

  return null;
}

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function getStems(product: any): number {
  if (typeof product.cantidad_total_stems === "number") return product.cantidad_total_stems;
  return product.cantidad || 0;
}

function getHeightMatch(ip: any, sp: any): boolean | null {
  const ih = ip.altura;
  const sh = sp.altura;
  // If neither has height info, it's not applicable
  if (ih == null && sh == null) return null;
  // If only one has height, it's a discrepancy
  if (ih == null || sh == null) return false;
  return ih === sh;
}
