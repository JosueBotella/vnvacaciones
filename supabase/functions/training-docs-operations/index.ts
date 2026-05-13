import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const errorResponse = (error: string, status = 200) =>
  new Response(JSON.stringify({ success: false, error }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const okResponse = (data: Record<string, unknown>) =>
  new Response(JSON.stringify({ success: true, ...data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, sessionToken } = body;

    if (!sessionToken) {
      return errorResponse('Session token required');
    }

    // Validate session
    const { data: session, error: sessionError } = await supabase
      .from('manager_sessions')
      .select('manager_id, expires_at')
      .eq('token', sessionToken)
      .single();

    if (sessionError || !session) {
      return errorResponse('Invalid session');
    }

    if (new Date(session.expires_at) < new Date()) {
      return errorResponse('Session expired');
    }

    const { data: manager } = await supabase
      .from('managers')
      .select('id, name, role, department_id')
      .eq('id', session.manager_id)
      .single();

    if (!manager) return errorResponse('Manager not found');
    const isAdmin = manager.role === 'admin';
    if (!isAdmin) return errorResponse('Admin only');

    switch (action) {
      case 'listTrainingDocuments': {
        const { data: docs, error: docsErr } = await supabase
          .from('incidencias_training_documents')
          .select('id, filename, file_size, document_type, description, active, created_at, uploaded_by')
          .order('created_at', { ascending: false });
        if (docsErr) return errorResponse('Failed to list documents');
        return okResponse({ documents: docs || [] });
      }

      case 'uploadTrainingDocument': {
        const { fileBase64, fileName, fileSize, documentType, description: docDesc } = body;
        if (!fileBase64 || !fileName) return errorResponse('File data required');
        if (fileSize > 5 * 1024 * 1024) return errorResponse('Archivo demasiado grande (máx 5MB)');

        const { count } = await supabase.from('incidencias_training_documents').select('id', { count: 'exact', head: true });
        if ((count || 0) >= 10) return errorResponse('Máximo 10 documentos de entrenamiento permitidos');

        const storagePath = `${crypto.randomUUID()}.pdf`;
        const fileBuffer = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
        const { error: uploadErr } = await supabase.storage
          .from('incidencias-training-docs')
          .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: false });
        if (uploadErr) return errorResponse('Upload failed: ' + uploadErr.message);

        let extractedText = '';
        try {
          const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
          if (GOOGLE_AI_API_KEY) {
            const aiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${GOOGLE_AI_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'gemini-2.5-flash',
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Extrae el texto completo de este documento legal laboral. Preserva la estructura, párrafos, artículos citados y formato. Devuelve SOLO el texto extraído, sin comentarios ni explicaciones.' },
                    { type: 'image_url', image_url: { url: `data:application/pdf;base64,${fileBase64}` } },
                  ],
                }],
              }),
            });
            if (aiRes.ok) {
              const aiData = await aiRes.json();
              extractedText = aiData.choices?.[0]?.message?.content || '';
            }
          }
        } catch (e) {
          console.warn('Text extraction failed:', e);
        }

        if (extractedText.length > 3000) {
          extractedText = extractedText.substring(0, 3000) + '\n[...texto truncado]';
        }

        const { data: doc, error: insertErr } = await supabase
          .from('incidencias_training_documents')
          .insert({
            filename: fileName,
            storage_path: storagePath,
            file_size: fileSize || 0,
            extracted_text: extractedText,
            document_type: documentType || 'otro',
            description: docDesc || '',
            uploaded_by: manager.name,
          })
          .select()
          .single();
        if (insertErr) return errorResponse('Failed to save document: ' + insertErr.message);
        return okResponse({ document: doc, textExtracted: extractedText.length > 0 });
      }

      case 'deleteTrainingDocument': {
        const { documentId: delDocId } = body;
        if (!delDocId) return errorResponse('documentId required');

        const { data: docToDelete } = await supabase
          .from('incidencias_training_documents')
          .select('storage_path')
          .eq('id', delDocId)
          .single();

        if (docToDelete?.storage_path) {
          await supabase.storage.from('incidencias-training-docs').remove([docToDelete.storage_path]);
        }

        const { error: delErr } = await supabase
          .from('incidencias_training_documents')
          .delete()
          .eq('id', delDocId);
        if (delErr) return errorResponse('Failed to delete document');
        return okResponse({ deleted: true });
      }

      case 'toggleTrainingDocument': {
        const { documentId: toggleDocId, active: toggleActive } = body;
        if (!toggleDocId) return errorResponse('documentId required');
        const { error: toggleErr } = await supabase
          .from('incidencias_training_documents')
          .update({ active: toggleActive })
          .eq('id', toggleDocId);
        if (toggleErr) return errorResponse('Failed to toggle document');
        return okResponse({ toggled: true });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (err) {
    console.error('training-docs-operations error:', err);
    return errorResponse('Internal server error');
  }
});
