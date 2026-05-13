import { useState, useEffect, useCallback, useRef } from "react";
import {
  Check, Building2, Users, Tag, CalendarDays,
  FileText, Camera, Video, Loader2, X, Search, ExternalLink, Scale, AlertTriangle, Mic, MicOff, CheckCircle2,
  Clock, ChevronDown, Sparkles, Star, ThumbsUp
} from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { useGravedades } from "@/hooks/useGravedades";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import type { IncidenciasUserContext } from "@/modules/control-incidencias/core/types";
import { SanctionSuggestionDialog, type SanctionSuggestion } from "./SanctionSuggestionDialog";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { compressEvidenceFile, EVIDENCE_MAX_BYTES, formatBytes, type CompressionProgress } from "@/lib/evidenceCompressor";

export interface IncidenciaPrefill {
  departmentId?: string;
  workerIds?: string[];
  accionPropuesta?: "amonestacion_escrita" | "sancion";
  skipToStep?: number;
}

interface Props {
  userContext: IncidenciasUserContext;
  onComplete: (prefill?: IncidenciaPrefill) => void;
  prefill?: IncidenciaPrefill | null;
}

interface Department { id: string; name: string; }
interface Worker {
  id: string;
  nombre: string;
  apellidos: string | null;
  worker_number: string | null;
  worker_code?: string | null;
  external_url_salix: string | null;
  department_id: string;
  department_name: string;
  is_external?: boolean;
}
interface Category { id: string; name: string; color: string; gravedad: string; puntos?: number; es_critico?: boolean; department_id?: string | null; department_ids?: string[]; }
interface WorkerRiskAlert { level: string; leves: number; graves: number; muy_graves: number; total: number; }

type AccionPropuesta = "solo_incidencia" | "amonestacion_escrita" | "sancion";

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/3gpp',
  'application/pdf',
]);
// Pre-compression limits — generous so móvil / WhatsApp videos pass through.
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;   // 50 MB raw image
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;  // 500 MB raw video (compressed before upload)

const gravedadColors: Record<string, string> = {
  leve: '#93d600',
  moderada: '#fb923c',
  grave: '#f59e0b',
  muy_grave: '#ef4444',
};

export function EncargadoNuevaIncidencia({ userContext, onComplete, prefill }: Props) {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const haptic = useHaptic();
  const { gravedades: gravedadConfigs } = useGravedades();
  const gravedadSortMap = gravedadConfigs.reduce<Record<string, number>>((acc, g) => { acc[g.key] = g.sort_order; return acc; }, {});
  const gravedadLabel = (key: string) => gravedadConfigs.find(g => g.key === key)?.label || key;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Data state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isPositiveMode, setIsPositiveMode] = useState(false);
  const [positiveCategories, setPositiveCategories] = useState<Array<{ id: string; name: string; color: string }>>([]);

  // Worker picker
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerPickerOpen, setWorkerPickerOpen] = useState(false);

  // External worker form (admin only)
  const [externalFormOpen, setExternalFormOpen] = useState(false);
  const [extName, setExtName] = useState("");
  const [extNumber, setExtNumber] = useState("");
  const [extDeptId, setExtDeptId] = useState("");
  const [extDeptCustomName, setExtDeptCustomName] = useState("");
  const [extDeptSearch, setExtDeptSearch] = useState("");
  const [extDeptOpen, setExtDeptOpen] = useState(false);
  const [extSubmitting, setExtSubmitting] = useState(false);

  // Category picker
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  // Form data
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [fecha] = useState(new Date().toISOString());
  const [fechaIncidente, setFechaIncidente] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [horaIncidente, setHoraIncidente] = useState(format(new Date(), 'HH:mm'));
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [manualGravedad, setManualGravedad] = useState<string>("");
  const [descripcion, setDescripcion] = useState("");
  const [pruebas, setPruebas] = useState<Array<{ file: File; preview: string; uploading: boolean; url?: string; progress: number; validated: boolean; error?: string }>>([]);
  const [accionPropuesta, setAccionPropuesta] = useState<AccionPropuesta>("solo_incidencia");
  const [propuestaSuspension, setPropuestaSuspension] = useState(false);
  const [propuestaFechaInicio, setPropuestaFechaInicio] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [riskAlerts, setRiskAlerts] = useState<Record<string, WorkerRiskAlert>>({});
  const [fechaPopoverOpen, setFechaPopoverOpen] = useState(false);
  const [suspensionPopoverOpen, setSuspensionPopoverOpen] = useState(false);

  // Sanction suggestion dialog state
  const [sanctionSuggestions, setSanctionSuggestions] = useState<SanctionSuggestion[]>([]);
  const [showSuggestionDialog, setShowSuggestionDialog] = useState(false);

  // Voice dictation state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [preguntaAclaracion, setPreguntaAclaracion] = useState<string | null>(null);
  
  
  const preRecordDescRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recordStartTimeRef = useRef<number>(0);

  const isQuickPath = accionPropuesta === 'solo_incidencia';
  const isFormal = accionPropuesta !== 'solo_incidencia';

  // Derive department from first selected worker
  const selectedDept = (() => {
    if (selectedWorkers.length === 0) return departments[0]?.id || "";
    const firstWorker = workers.find(w => w.id === selectedWorkers[0]);
    return firstWorker?.department_id || departments[0]?.id || "";
  })();

  // ── Data loading ──────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        // Fetch manager's own departments (for category filtering etc.)
        const deptRes = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "getMyDepartments", sessionToken, targetManagerId: userContext.managerId },
        });
        let depts = deptRes.data?.departments || [];
        setDepartments(depts);

        // Fetch ALL departments so encargados/responsables can create incidents for any worker
        const allDeptRes = await supabase.functions.invoke("incidencias-operations", {
          body: { action: "listAllDepartmentsForWorkers", sessionToken },
        });
        const allDepts: Department[] = allDeptRes.data?.departments || [];
        const deptsForWorkers = allDepts.length > 0 ? allDepts : depts;

        if (deptsForWorkers.length > 0) {
          const workerResults = await Promise.all(
            deptsForWorkers.map((d: Department) =>
              supabase.functions.invoke("incidencias-operations", {
                body: { action: "listIncidenciasWorkers", sessionToken, departmentId: d.id },
              })
            )
          );
          const deptMap = new Map(deptsForWorkers.map((d: Department) => [d.id, d.name]));
          const allWorkers: Worker[] = [];
          const seenIds = new Set<string>();
          workerResults.forEach((res, idx) => {
            const dept = deptsForWorkers[idx];
            const rawWorkers = res.data?.workers || [];
            rawWorkers.forEach((w: any) => {
              if (!seenIds.has(w.id)) {
                seenIds.add(w.id);
                allWorkers.push({ ...w, department_id: dept.id, department_name: deptMap.get(dept.id) || dept.name });
              }
            });
          });
          allWorkers.sort((a, b) => {
            const nameA = [a.nombre, a.apellidos].filter(Boolean).join(" ").toLowerCase();
            const nameB = [b.nombre, b.apellidos].filter(Boolean).join(" ").toLowerCase();
            return nameA.localeCompare(nameB);
          });
          setWorkers(allWorkers);
        }
        // Load positive categories
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "listPositiveCategories", sessionToken },
        }).then(({ data }) => setPositiveCategories(data?.categories?.filter((c: any) => c.active) || [])).catch(() => {});
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    init();
  }, [sessionToken, userContext.managerId, userContext.departmentIds]);

  useEffect(() => {
    if (!selectedDept && departments.length === 0) { setCategories([]); return; }
    // When no worker selected & multiple departments, pass all dept IDs to get all categories
    const useAllDepts = selectedWorkers.length === 0 && departments.length > 1;
    const body: any = { action: "listCategories", sessionToken };
    if (useAllDepts) {
      body.departmentIds = departments.map(d => d.id);
    } else {
      body.departmentId = selectedDept;
    }
    supabase.functions.invoke("incidencias-operations", { body }).then(({ data }) => {
      setCategories(data?.categories || []);
    }).catch(() => {});
  }, [sessionToken, selectedDept, selectedWorkers.length, departments]);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.workerIds) setSelectedWorkers(prefill.workerIds);
    if (prefill.accionPropuesta) setAccionPropuesta(prefill.accionPropuesta as AccionPropuesta);
  }, [prefill]);

  // ── Worker helpers ──────────────────────────────────
  const filteredWorkers = workers.filter(w => {
    if (!workerSearch) return true;
    const q = workerSearch.toLowerCase();
    return w.nombre.toLowerCase().includes(q) || (w.apellidos || "").toLowerCase().includes(q) || (w.worker_number || "").toLowerCase().includes(q) || (w.worker_code || "").toLowerCase().includes(q);
  });

  const toggleWorker = (id: string) => {
    setSelectedWorkers(prev => {
      const next = prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id];
      if (next.length > 0) {
        const firstW = workers.find(w => w.id === next[0]);
        const deptId = firstW?.department_id || "";
        supabase.functions.invoke("incidencias-operations", {
          body: { action: "getWorkerRiskAlert", sessionToken, workerIds: next, departmentId: deptId },
        }).then(({ data }) => {
          if (data?.success && data.alerts) setRiskAlerts(data.alerts);
        }).catch(() => {});
      } else { setRiskAlerts({}); }
      return next;
    });
  };

  const handleAddExternalWorker = async () => {
    const name = extName.trim();
    const number = extNumber.trim();
    if (!name) { toast.error("Introduce el nombre completo"); return; }
    if (!number) { toast.error("Introduce el nº de fichaje"); return; }
    if (!extDeptId && !extDeptCustomName.trim()) { toast.error("Selecciona o escribe un departamento"); return; }

    const parts = name.split(/\s+/);
    const nombre = parts[0];
    const apellidos = parts.slice(1).join(" ") || null;

    setExtSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "createExternalIncidenciasWorker",
          sessionToken,
          nombre,
          apellidos,
          workerNumber: number,
          departmentId: extDeptId || undefined,
          customDepartmentName: extDeptId ? undefined : extDeptCustomName.trim(),
        },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "No se pudo crear el trabajador externo");
        return;
      }
      const w = data.worker;
      const deptName = w.department_name
        || departments.find(d => d.id === w.department_id)?.name
        || extDeptCustomName.trim()
        || "";
      const newWorker: Worker = {
        id: w.id,
        nombre: w.nombre,
        apellidos: w.apellidos || null,
        worker_number: w.worker_number || null,
        worker_code: null,
        external_url_salix: w.external_url_salix || null,
        department_id: w.department_id,
        department_name: deptName,
        is_external: true,
      };
      // Si se creó un departamento nuevo, añadirlo a la lista local
      if (!departments.some(d => d.id === w.department_id)) {
        setDepartments(prev => [...prev, { id: w.department_id, name: deptName }]);
      }
      setWorkers(prev => prev.some(x => x.id === newWorker.id) ? prev : [...prev, newWorker]);
      setSelectedWorkers(prev => prev.includes(newWorker.id) ? prev : [...prev, newWorker.id]);
      setExternalFormOpen(false);
      setExtName(""); setExtNumber(""); setExtDeptId(""); setExtDeptCustomName(""); setExtDeptSearch("");
      toast.success("Trabajador externo añadido");
    } catch (err: any) {
      toast.error(err?.message || "Error al añadir trabajador");
    } finally {
      setExtSubmitting(false);
    }
  };

  // ── Voice Dictation (MediaRecorder → Gemini Audio Transcription) ──────────
  const audioSupported = typeof window !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!audioSupported) return;
    const MIC_FLAG = 'mic_permission_granted';
    (async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            if (status.state === 'granted') { localStorage.setItem(MIC_FLAG, '1'); return; }
            if (status.state === 'denied') return;
          } catch {}
        }
        if (localStorage.getItem(MIC_FLAG)) return;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        localStorage.setItem(MIC_FLAG, '1');
      } catch {}
    })();
  }, [audioSupported]);

  const startRecording = useCallback(async () => {
    if (!audioSupported) { toast.error("Tu navegador no soporta grabación de audio."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
      audioChunksRef.current = [];
      preRecordDescRef.current = descripcion;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        setInterimTranscript("");

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType.split(';')[0] });
        if (audioBlob.size < 1000) {
          toast.info("Audio demasiado corto");
          return;
        }

        setIsProcessingVoice(true);
        try {
          // Convert audio to base64 (chunked to avoid stack overflow)
          const arrayBuffer = await audioBlob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const base64 = btoa(binary);

          const now = new Date();
          const trabajadoresImplicados = selectedWorkers.map(id => {
            const w = workers.find(wr => wr.id === id);
            return w ? `${w.nombre}${w.apellidos ? ' ' + w.apellidos : ''}${w.worker_number ? ' (Nº ' + w.worker_number + ')' : ''}` : '';
          }).filter(Boolean);
          const categoriaSeleccionada = categories.find(c => c.id === selectedCategory);
          const tienePruebas = pruebas.filter(p => p.url).length;

          const { data, error } = await supabase.functions.invoke('control-incidencias-ai', {
            body: {
              action: 'transcribir_audio',
              audio_base64: base64,
              mime_type: mimeType.split(';')[0],
              fecha_actual: format(now, 'yyyy-MM-dd'),
              hora_actual: format(now, 'HH:mm'),
              trabajadores: trabajadoresImplicados,
              categoria: categoriaSeleccionada ? `${categoriaSeleccionada.name} (${categoriaSeleccionada.gravedad})` : null,
              tiene_pruebas: tienePruebas > 0,
              num_pruebas: tienePruebas,
            },
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          const cleanText = data?.texto || '';
          if (!cleanText.trim()) {
            toast.info("No se detectó voz en el audio");
            return;
          }

          const base2 = preRecordDescRef.current.trim();
          setDescripcion(base2 + (base2 ? ' ' : '') + cleanText);
          if (data?.fecha_extraida) setFechaIncidente(data.fecha_extraida);
          if (data?.hora_extraida) setHoraIncidente(data.hora_extraida);
          if (data?.pregunta_aclaracion) setPreguntaAclaracion(data.pregunta_aclaracion);
          toast.success("Audio transcrito con IA ✓");
        } catch (err) {
          console.error('Transcription error:', err);
          toast.error("Error al transcribir el audio");
        } finally {
          setIsProcessingVoice(false);
        }
      };

      recorder.onerror = () => {
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        toast.error("Error en la grabación de audio");
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // collect in 1s chunks
      setIsRecording(true);
      recordStartTimeRef.current = Date.now();
      setInterimTranscript("Grabando audio...");
      if ('vibrate' in navigator) navigator.vibrate(50);
    } catch (err) {
      toast.error("Permiso de micrófono denegado");
      setIsRecording(false);
    }
  }, [audioSupported, descripcion, selectedWorkers, workers, categories, selectedCategory, pruebas]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── File handling ──────────────────────────────────
  const uploadFile = async (file: File, idx: number, retry = false) => {
    const progressInterval = setInterval(() => {
      setPruebas(prev => prev.map((p, i) => i === idx && p.uploading ? { ...p, progress: Math.min(p.progress + 8, 90) } : p));
    }, 200);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionToken', sessionToken);
      const res = await supabase.functions.invoke("incidencias-operations", { body: formData });
      clearInterval(progressInterval);
      if (res.data?.success) {
        setPruebas(prev => prev.map((p, i) => i === idx ? { ...p, uploading: false, url: res.data.path || res.data.url, progress: 100, validated: true } : p));
      } else {
        if (!retry) setTimeout(() => uploadFile(file, idx, true), 2000);
        else { setPruebas(prev => prev.map((p, i) => i === idx ? { ...p, uploading: false, progress: 0, error: res.data?.error || 'Error' } : p)); toast.error(res.data?.error || "Error al subir archivo"); }
      }
    } catch {
      clearInterval(progressInterval);
      if (!retry) setTimeout(() => uploadFile(file, idx, true), 2000);
      else { setPruebas(prev => prev.map((p, i) => i === idx ? { ...p, uploading: false, progress: 0, error: 'Error de conexión' } : p)); toast.error("Error al subir archivo"); }
    }
  };

  const processFiles = useCallback(async (files: File[]) => {
    // Encargados: NO comprimir antes de subir. Subir el archivo original directo
    // para que el envío sea inmediato. Las imágenes pequeñas se optimizan rápido,
    // pero los vídeos NUNCA se procesan con ffmpeg.wasm aquí (es lento y bloquea
    // al encargado). El backend acepta hasta 500MB.
    const prepared: { file: File; preview: string }[] = [];
    for (const rawFile of files) {
      if (!ALLOWED_MIME_TYPES.has(rawFile.type)) { toast.error(`Tipo no permitido: ${rawFile.type}`); continue; }
      const isVideo = rawFile.type.startsWith('video/');
      const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      if (rawFile.size > maxSize) { toast.error(`${rawFile.name} demasiado grande (${formatBytes(rawFile.size)})`); continue; }

      let file = rawFile;
      // Solo optimizar imágenes (rápido, sin ffmpeg). Vídeos pasan tal cual.
      if (rawFile.type.startsWith('image/')) {
        try {
          file = await compressEvidenceFile(rawFile, (_p: CompressionProgress) => {});
        } catch {
          file = rawFile;
        }
      }

      if (file.size > EVIDENCE_MAX_BYTES) {
        toast.error(`${file.name} sigue siendo demasiado grande (${formatBytes(file.size)})`);
        continue;
      }

      const preview = file.type === 'application/pdf'
        ? '' // PDFs don't have image previews
        : URL.createObjectURL(file);
      prepared.push({ file, preview });
    }
    if (prepared.length === 0) return;

    setPruebas(prev => {
      const baseIdx = prev.length;
      const newEntries = prepared.map(c => ({ file: c.file, preview: c.preview, uploading: true, progress: 0, validated: false } as typeof prev[number]));
      prepared.forEach((c, i) => uploadFile(c.file, baseIdx + i));
      return [...prev, ...newEntries];
    });
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
    e.target.value = "";
  };

  // ── Clipboard paste handler ──────────────────────────────────
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        toast.info(`📎 ${files.length} archivo(s) pegado(s) desde portapapeles`);
        processFiles(files);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [processFiles]);

  const removePrueba = (idx: number) => setPruebas(prev => prev.filter((_, i) => i !== idx));

  // ── Submit ──────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const pruebasUrls = pruebas.filter(p => p.url).map(p => p.url);
      const fechaCompleta = fechaIncidente && horaIncidente ? `${fechaIncidente}T${horaIncidente}:00` : fechaIncidente || fecha;
      const firstWorker = workers.find(w => w.id === selectedWorkers[0]);
      const departmentId = firstWorker?.department_id || departments[0]?.id || "";

      if (isPositiveMode) {
        // Create positive record
        const { data } = await supabase.functions.invoke("incidencias-operations", {
          body: {
            action: "createPositiveRecord", sessionToken, departmentId,
            categoryId: selectedCategory,
            workerIds: selectedWorkers, fecha: fechaIncidente, descripcion, pruebasUrls,
          },
        });
        if (data?.success) {
          toast.success("Reconocimiento registrado ✓");
          haptic.success();
          onComplete();
        } else { toast.error(data?.error || "Error al registrar"); haptic.error(); }
        return;
      }

      const { data } = await supabase.functions.invoke("incidencias-operations", {
        body: {
          action: "createIncidencia", sessionToken, departmentId,
          categoryId: selectedCategory || null,
          customCategoryName: customCategoryName.trim() || null,
          workerIds: selectedWorkers, fecha: fechaCompleta, descripcion, pruebasUrls,
          manualGravedad: manualGravedad || null,
          accionPropuesta,
          propuestaSuspension: accionPropuesta === 'sancion' ? propuestaSuspension : false,
          propuestaFechaInicio: accionPropuesta === 'sancion' && propuestaSuspension ? propuestaFechaInicio || null : null,
        },
      });
      if (data?.success) {
        toast.success("Incidencia registrada ✓");
        haptic.success();
        if (data.autoEscalado && Array.isArray(data.autoEscalado) && data.autoEscalado.length > 0) {
          const suggestions: SanctionSuggestion[] = data.autoEscalado.map((e: any) => ({
            workerId: e.workerId,
            workerName: e.workerName,
            counts: e.counts || { leve: 0, grave: 0, muy_grave: 0 },
            thresholds: e.thresholds || { leves: 3, graves: 1, muy_graves: 1 },
            periodDays: e.periodDays || 90,
            urgency: e.urgency || 'warning',
            recommendedAction: e.recommendedAction || 'amonestacion',
            ruleDescription: e.ruleDescription,
          }));
          setSanctionSuggestions(suggestions);
          setShowSuggestionDialog(true);
        } else {
          onComplete();
        }
      } else { toast.error(data?.error || "Error al registrar"); haptic.error(); }
    } catch { toast.error("Error al registrar"); haptic.error(); }
    finally { setSubmitting(false); }
  };

  // ── Validation ──────────────────────────────────
  const canSubmit = (() => {
    if (submitting || pruebas.some(p => p.uploading)) return false;
    if (!fechaIncidente) return false;
    if (!selectedCategory) return false;
    if (isFormal) {
      if (descripcion.trim().length < 20) return false;
    }
    return true;
  })();

  // ── Loading / empty states ──────────────────────────────────
  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (departments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <Building2 className="h-12 w-12 text-muted-foreground/40" />
        <h3 className="text-lg font-semibold text-foreground">Sin departamentos configurados</h3>
        <p className="text-sm text-muted-foreground max-w-sm">No hay departamentos de incidencias creados.</p>
      </div>
    );
  }

  const selectedCatObj = categories.find(c => c.id === selectedCategory);

  // ══════════════════════════════════════════════════════════════
  //  RENDER — Single scrollable form
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="max-w-lg mx-auto pb-32">
      {/* Hidden file inputs */}
      <input ref={photoInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleFileSelect} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />

      {/* ── Mode toggle: Incidencia ↔ Reconocimiento ────────────── */}
      <section className="mb-4 mt-6">
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-muted/40 border border-border/30">
          <button
            onClick={() => { setIsPositiveMode(false); haptic.light(); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all",
              !isPositiveMode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <AlertTriangle className="h-4 w-4" />
            Incidencia
          </button>
          <button
            onClick={() => { setIsPositiveMode(true); setAccionPropuesta("solo_incidencia"); haptic.light(); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all",
              isPositiveMode ? "bg-primary/10 shadow-sm text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Star className="h-4 w-4" />
            Reconocimiento
          </button>
        </div>
      </section>

      {/* ── 1. Action type selector (only for negative) ────────────── */}
      {!isPositiveMode && (
      <section className="mb-6 mt-2">
        <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2">Tipo de registro</p>
        {/* Solo Registro — full width, default */}
        <button
          onClick={() => { setAccionPropuesta("solo_incidencia"); setFechaIncidente(format(new Date(), 'yyyy-MM-dd')); setHoraIncidente(format(new Date(), 'HH:mm')); haptic.light(); }}
          className={cn(
            "w-full rounded-2xl border-2 px-4 py-3.5 text-left transition-all mb-2",
            accionPropuesta === "solo_incidencia"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border/40 bg-card hover:border-border"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", accionPropuesta === "solo_incidencia" ? "bg-primary/15" : "bg-muted")}>
              <FileText className={cn("h-5 w-5", accionPropuesta === "solo_incidencia" ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Solo Registro</p>
              <p className="text-xs text-muted-foreground">Registro rápido informativo</p>
            </div>
            <div className={cn("h-5 w-5 rounded-full border-2 flex items-center justify-center", accionPropuesta === "solo_incidencia" ? "border-primary" : "border-border")}>
              {accionPropuesta === "solo_incidencia" && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
            </div>
          </div>
        </button>
        {/* Amonestación + Sanción — side by side */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { setAccionPropuesta("amonestacion_escrita"); setFechaIncidente(""); setHoraIncidente(""); haptic.light(); }}
            className={cn(
              "rounded-2xl border-2 px-3 py-3 text-center transition-all",
              accionPropuesta === "amonestacion_escrita"
                ? "border-amber-500 bg-amber-500/5 shadow-sm"
                : "border-border/40 bg-card hover:border-border"
            )}
          >
            <AlertTriangle className={cn("h-5 w-5 mx-auto mb-1", accionPropuesta === "amonestacion_escrita" ? "text-amber-500" : "text-muted-foreground")} />
            <p className="text-xs font-semibold">Amonestación</p>
          </button>
          <button
            onClick={() => { setAccionPropuesta("sancion"); setFechaIncidente(""); setHoraIncidente(""); haptic.light(); }}
            className={cn(
              "rounded-2xl border-2 px-3 py-3 text-center transition-all",
              accionPropuesta === "sancion"
                ? "border-destructive bg-destructive/5 shadow-sm"
                : "border-border/40 bg-card hover:border-border"
            )}
          >
            <Scale className={cn("h-5 w-5 mx-auto mb-1", accionPropuesta === "sancion" ? "text-destructive" : "text-muted-foreground")} />
            <p className="text-xs font-semibold">Sanción</p>
          </button>
        </div>
      </section>
      )}

      {/* ── 2. Worker selector ────────────── */}
      <section className="mb-5">
        <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2">
          Trabajador(es) {isFormal && <span className="text-destructive">*</span>}
        </p>
        {/* Selected chips */}
        {selectedWorkers.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-2">
            {selectedWorkers.map(id => {
              const w = workers.find(w => w.id === id);
              if (!w) return null;
              return (
                <Badge key={id} variant="secondary" className={cn("gap-1 text-xs px-2.5 py-1 rounded-full", w.is_external && "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30")}>
                  {w.nombre} {w.apellidos ? w.apellidos.split(' ')[0] : ''}
                  {w.is_external && <span className="text-[9px] font-semibold uppercase tracking-wide">Externo</span>}
                  <button onClick={() => toggleWorker(id)}><X className="h-3 w-3" /></button>
                </Badge>
              );
            })}
          </div>
        )}
        {/* Risk alerts */}
        {selectedWorkers.length > 0 && Object.entries(riskAlerts).some(([id, a]) => selectedWorkers.includes(id) && a.level !== 'none') && (
          <div className="space-y-1 mb-2">
            {selectedWorkers.map(id => {
              const alert = riskAlerts[id];
              if (!alert || alert.level === 'none') return null;
              const w = workers.find(w => w.id === id);
              const name = w ? [w.nombre, w.apellidos].filter(Boolean).join(" ") : id;
              const bgColor = alert.level === 'red' ? 'bg-destructive/10 border-destructive/30' : alert.level === 'orange' ? 'bg-orange-500/10 border-orange-500/30' : 'bg-amber-500/10 border-amber-500/30';
              const textColor = alert.level === 'red' ? 'text-destructive' : alert.level === 'orange' ? 'text-orange-600' : 'text-amber-600';
              const msg = alert.level === 'red' ? `${name}: ${alert.muy_graves} muy grave(s)` : alert.level === 'orange' ? `${name}: ${alert.graves} grave(s)` : `${name}: ${alert.leves} leve(s)`;
              return (
                <div key={id} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium", bgColor, textColor)}>
                  <AlertTriangle className="h-3 w-3 shrink-0" />{msg}
                </div>
              );
            })}
          </div>
        )}
        {/* Dropdown trigger */}
        <Popover open={workerPickerOpen} onOpenChange={setWorkerPickerOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center justify-between w-full h-12 px-4 rounded-xl border border-border/40 bg-muted/30 text-sm hover:border-border transition-colors">
              <span className={cn(selectedWorkers.length === 0 && "text-muted-foreground")}>
                {selectedWorkers.length === 0 ? "Seleccionar trabajador..." : `${selectedWorkers.length} seleccionado(s)`}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-xl max-h-72 overflow-hidden" align="start">
            <div className="p-2 border-b border-border/30">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={workerSearch} onChange={e => setWorkerSearch(e.target.value)} className="pl-8 h-9 rounded-lg text-sm" autoFocus />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              {filteredWorkers.map(w => {
                const isSelected = selectedWorkers.includes(w.id);
                const fullName = [w.nombre, w.apellidos].filter(Boolean).join(" ");
                const alert = riskAlerts[w.id];
                const hasAlert = alert && alert.level !== 'none';
                return (
                  <div key={w.id} onClick={() => toggleWorker(w.id)} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors", isSelected ? 'bg-primary/10' : 'hover:bg-muted/50')}>
                    <Checkbox checked={isSelected} className="h-4 w-4 rounded-full" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{fullName}</p>
                        {w.is_external && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0">Externo</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {w.worker_number && !w.is_external && (
                          <a href={`https://salix.verdnatura.es/#/worker/${w.worker_number}/time-control`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                            Nº {w.worker_number}<ExternalLink className="h-2 w-2 opacity-50" />
                          </a>
                        )}
                        {w.worker_number && w.is_external && (
                          <span className="text-[10px] text-muted-foreground">Nº {w.worker_number}</span>
                        )}
                        {w.department_name && <span className="text-[10px] text-muted-foreground">{w.worker_number ? '· ' : ''}{w.department_name}</span>}
                      </div>
                    </div>
                    {hasAlert && <div className={cn("h-2 w-2 rounded-full shrink-0", alert.level === 'red' ? 'bg-destructive' : alert.level === 'orange' ? 'bg-orange-500' : 'bg-amber-500')} />}
                  </div>
                );
              })}
              {filteredWorkers.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Sin resultados</p>}
            </div>
          </PopoverContent>
        </Popover>

        {/* Admin only: add external worker */}
        {userContext.role === 'admin' && (
          <div className="mt-2">
            {!externalFormOpen ? (
              <button
                type="button"
                onClick={() => setExternalFormOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <span className="text-amber-600">+</span> ¿No está en el sistema? Añadir trabajador externo
              </button>
            ) : (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Trabajador externo</p>
                  <span className="text-[10px] text-muted-foreground">Solo admin</span>
                </div>
                <Input
                  placeholder="Nombre completo *"
                  value={extName}
                  onChange={e => setExtName(e.target.value)}
                  className="h-9 rounded-lg text-sm"
                  maxLength={120}
                />
                <Input
                  placeholder="Nº de fichaje *"
                  value={extNumber}
                  onChange={e => setExtNumber(e.target.value)}
                  className="h-9 rounded-lg text-sm"
                  maxLength={30}
                />
                {/* Combobox de departamento con opción "usar como temporal" */}
                <Popover open={extDeptOpen} onOpenChange={setExtDeptOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={cn("flex items-center gap-2 truncate", !extDeptId && !extDeptCustomName && "text-muted-foreground")}>
                        <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        {extDeptId
                          ? (departments.find(d => d.id === extDeptId)?.name || "Departamento")
                          : extDeptCustomName
                            ? <span className="truncate">{extDeptCustomName} <span className="text-amber-600 text-[10px] font-medium ml-1">temporal</span></span>
                            : "Departamento *"}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0 bg-popover border shadow-lg z-[100]"
                    align="start"
                    sideOffset={4}
                  >
                    <div className="flex items-center border-b px-3 py-1.5">
                      <Search className="h-3.5 w-3.5 mr-2 opacity-50 shrink-0" />
                      <input
                        autoFocus
                        type="text"
                        value={extDeptSearch}
                        onChange={e => setExtDeptSearch(e.target.value)}
                        placeholder="Buscar o escribir nuevo..."
                        className="flex h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {(() => {
                        const q = extDeptSearch.trim().toLowerCase();
                        const filtered = q
                          ? departments.filter(d => d.name.toLowerCase().includes(q))
                          : departments;
                        const exactMatch = q && filtered.some(d => d.name.toLowerCase() === q);
                        return (
                          <>
                            {q && !exactMatch && (
                              <button
                                type="button"
                                onClick={() => {
                                  setExtDeptId("");
                                  setExtDeptCustomName(extDeptSearch.trim());
                                  setExtDeptOpen(false);
                                  setExtDeptSearch("");
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60 border-b border-border/50"
                              >
                                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 text-xs font-bold">+</span>
                                <span className="flex-1 truncate">
                                  Usar <span className="font-medium">«{extDeptSearch.trim()}»</span> como temporal
                                </span>
                              </button>
                            )}
                            {filtered.length === 0 && !q && (
                              <p className="text-xs text-muted-foreground text-center py-3">Sin departamentos</p>
                            )}
                            {filtered.map(d => {
                              const isSelected = extDeptId === d.id;
                              return (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => {
                                    setExtDeptId(d.id);
                                    setExtDeptCustomName("");
                                    setExtDeptOpen(false);
                                    setExtDeptSearch("");
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent/60 transition-colors",
                                    isSelected && "bg-accent/40 font-medium"
                                  )}
                                >
                                  <Check className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100 text-amber-600" : "opacity-0")} />
                                  <span className="truncate">{d.name}</span>
                                </button>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="flex gap-2 justify-end pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setExternalFormOpen(false); setExtName(""); setExtNumber(""); setExtDeptId(""); setExtDeptCustomName(""); setExtDeptSearch(""); }}
                    disabled={extSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddExternalWorker}
                    disabled={extSubmitting}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {extSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5 mr-1" />Añadir</>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 3. Category selector ────────────── */}
      {isPositiveMode ? (
        <section className="mb-5">
          <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2">
            Tipo de reconocimiento <span className="text-destructive">*</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {positiveCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); haptic.light(); }}
                className={cn(
                  "rounded-xl border-2 px-3 py-3 text-left transition-all",
                  selectedCategory === cat.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border/40 bg-card hover:border-border"
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm font-medium">{cat.name}</span>
                </div>
              </button>
            ))}
            {positiveCategories.length === 0 && (
              <p className="text-xs text-muted-foreground col-span-2 text-center py-4">No hay categorías positivas configuradas. Créalas en Categorías.</p>
            )}
          </div>
        </section>
      ) : (
      <section className="mb-5">
        <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2">
          Categoría <span className="text-destructive">*</span>
        </p>
        <Popover open={categoryPickerOpen} onOpenChange={(open) => { setCategoryPickerOpen(open); if (!open) setCategorySearch(""); }}>
          <PopoverTrigger asChild>
            <button className="flex items-center justify-between w-full h-12 px-4 rounded-xl border border-border/40 bg-muted/30 text-sm hover:border-border transition-colors">
              {selectedCatObj ? (() => {
                const displayGravedad = selectedCatObj.gravedad === 'depende' && manualGravedad ? manualGravedad : selectedCatObj.gravedad;
                const gConf = gravedadConfigs.find(g => g.key === displayGravedad);
                const gColor = gConf?.color || gravedadColors[displayGravedad] || selectedCatObj.color;
                return (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: gColor }} />
                    <span className="font-medium">{selectedCatObj.name}</span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0" style={{ backgroundColor: gColor + '20', color: gColor }}>
                      {gravedadLabel(displayGravedad)}
                    </Badge>
                  </div>
                );
              })() : (
                <span className="text-muted-foreground">Seleccionar categoría...</span>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-xl max-h-72 overflow-hidden" align="start">
            <div className="p-2 border-b border-border/30">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar categoría..." value={categorySearch} onChange={e => setCategorySearch(e.target.value)} className="pl-8 h-9 rounded-lg text-sm" autoFocus />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              {categories
                .filter(c => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()))
                .sort((a, b) => {
                  const aOtro = /^otros?$/i.test(a.name) ? 1 : 0;
                  const bOtro = /^otros?$/i.test(b.name) ? 1 : 0;
                  if (aOtro !== bOtro) return aOtro - bOtro;
                  const order = gravedadSortMap;
                  return (order[a.gravedad] ?? 99) - (order[b.gravedad] ?? 99);
                })
                .map(cat => {
                const gColor = gravedadColors[cat.gravedad] || cat.color;
                const isSelected = selectedCategory === cat.id;
                const isOtros = /^otros?$/i.test(cat.name);
                const isGlobal = !cat.department_id && (!cat.department_ids || cat.department_ids.length === 0);
                return (
                  <div key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setManualGravedad("");
                      if (!isOtros) { setCategoryPickerOpen(false); setCategorySearch(""); }
                    }}
                    className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors", isSelected ? 'bg-muted/60' : 'hover:bg-muted/30')}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: gColor }} />
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{cat.name}</span>
                      <span className="text-[8px] text-muted-foreground/50 uppercase tracking-wider shrink-0">{isGlobal ? 'global' : 'dept'}</span>
                    </div>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0" style={{ backgroundColor: gColor + '20', color: gColor }}>
                      {gravedadLabel(cat.gravedad)}
                    </Badge>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                );
              })}
              {categories.filter(c => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase())).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Sin resultados</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
        {/* Custom category name for "Otros" */}
        {selectedCatObj && (selectedCatObj.name.toLowerCase() === 'otros' || selectedCatObj.name.toLowerCase() === 'otro') && (
          <Input
            placeholder="Especifica el tipo..."
            value={customCategoryName}
            onChange={e => setCustomCategoryName(e.target.value)}
            className="mt-2 rounded-xl h-10 text-sm border-border/40 bg-muted/30"
            autoFocus
          />
        )}
        {/* Gravity selector for "Depende" categories */}
        {selectedCatObj && selectedCatObj.gravedad === 'depende' && (
          <div className="mt-2">
            <p className="text-[10px] text-muted-foreground mb-1.5">Gravedad</p>
            <div className="flex flex-wrap gap-1.5">
              {gravedadConfigs
                .filter(g => g.active && g.key !== 'depende')
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(g => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setManualGravedad(g.key)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                      manualGravedad === g.key
                        ? "border-transparent ring-1 ring-offset-1 ring-offset-background"
                        : "border-border/40 hover:border-border bg-muted/30"
                    )}
                    style={manualGravedad === g.key ? {
                      backgroundColor: g.color + '20',
                      color: g.color,
                      // @ts-ignore
                      '--tw-ring-color': g.color,
                    } : undefined}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                    {g.label}
                  </button>
                ))}
            </div>
          </div>
        )}
      </section>
      )}

      {/* ── 4. Date & Time ────────────── */}
      <section className="mb-5">
        <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2">
          Fecha y hora <span className="text-destructive">*</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Popover open={fechaPopoverOpen} onOpenChange={setFechaPopoverOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center justify-between w-full h-12 px-4 rounded-xl border border-border/40 bg-muted/30 text-sm hover:border-border transition-colors">
                <span className={cn(!fechaIncidente && "text-muted-foreground")}>{fechaIncidente ? format(parse(fechaIncidente, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : 'Fecha'}</span>
                <CalendarDays className="h-4 w-4 text-primary opacity-70" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-xl border-border/40" align="start">
              <Calendar
                mode="single"
                selected={fechaIncidente ? parse(fechaIncidente, 'yyyy-MM-dd', new Date()) : undefined}
                onSelect={(date) => { if (date) { setFechaIncidente(format(date, 'yyyy-MM-dd')); setFechaPopoverOpen(false); } }}
                locale={es}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-2 h-12 px-4 rounded-xl border border-border/40 bg-muted/30">
            <Clock className="h-4 w-4 text-primary opacity-70 shrink-0" />
            <input
              type="time"
              value={horaIncidente}
              onChange={e => setHoraIncidente(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground outline-none [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-50"
            />
          </div>
        </div>
        {!fechaIncidente && <p className="text-xs text-destructive mt-1">Selecciona la fecha del hecho</p>}
      </section>

      {/* ── 5. Pruebas (optional) ────────────── */}
      <section className="mb-5">
        <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2">
          Pruebas
        </p>
        <div className="flex gap-2 mb-2">
          <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5 flex-1" onClick={() => photoInputRef.current?.click()}>
            <Camera className="h-4 w-4" /> Foto
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5 flex-1" onClick={() => videoInputRef.current?.click()}>
            <Video className="h-4 w-4" /> Vídeo
          </Button>
        </div>
        {pruebas.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {pruebas.map((p, idx) => (
              <div key={idx} className="relative rounded-xl overflow-hidden border border-border/40 aspect-square bg-muted/30">
                {p.file.type.startsWith('video/') ? (
                  <video src={p.preview} className="w-full h-full object-cover" />
                ) : p.file.type === 'application/pdf' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                    <FileText className="h-8 w-8" />
                    <span className="text-[10px] truncate max-w-full px-1">{p.file.name}</span>
                  </div>
                ) : (
                  <img src={p.preview} alt="" className="w-full h-full object-cover" />
                )}
                {p.uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
                {p.error && (
                  <div className="absolute inset-0 bg-destructive/40 flex items-center justify-center">
                    <X className="h-5 w-5 text-white" />
                  </div>
                )}
                {p.validated && (
                  <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
                <button onClick={() => removePrueba(idx)} className="absolute top-1 left-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80">
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 6. Descripción (optional for solo_incidencia, required for formal) ────────────── */}
      <section className="mb-5">
        <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2">
          Descripción {isFormal && <span className="text-destructive">*</span>}
        </p>
        <div className="relative">
          <Textarea
            ref={textareaRef}
            placeholder={isFormal ? "Describe los hechos con detalle (mín. 20 caracteres)..." : "Descripción opcional..."}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            className="min-h-[100px] rounded-xl border-border/40 bg-muted/30 text-sm resize-none pr-12"
          />
           {audioSupported && (
            <button
              onClick={() => isRecording ? stopRecording() : startRecording()}
              className={cn(
                "absolute bottom-2 right-2 h-9 w-9 rounded-full flex items-center justify-center transition-all",
                isRecording ? "bg-destructive text-white animate-pulse scale-110" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>
        {isRecording && interimTranscript && (
          <p className="text-xs text-primary mt-1 animate-pulse">🎙 {interimTranscript}</p>
        )}
        {isProcessingVoice && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Transcribiendo audio con IA...</p>
        )}
        {/* Botón "Mejorar con IA" para texto manual */}
        {!isRecording && !isProcessingVoice && descripcion.trim().length > 5 && (
          <button
            type="button"
            onClick={async () => {
              setIsProcessingVoice(true);
              try {
                const now = new Date();
                const trabajadoresImplicados = selectedWorkers.map(id => {
                  const w = workers.find(wr => wr.id === id);
                  return w ? `${w.nombre}${w.apellidos ? ' ' + w.apellidos : ''}${w.worker_number ? ' (Nº ' + w.worker_number + ')' : ''}` : '';
                }).filter(Boolean);
                const categoriaSeleccionada = categories.find(c => c.id === selectedCategory);
                const tienePruebas = pruebas.filter(p => p.url).length;
                const { data, error } = await supabase.functions.invoke('control-incidencias-ai', {
                  body: { action: 'limpiar_transcripcion', texto_crudo: descripcion.trim(), fecha_actual: format(now, 'yyyy-MM-dd'), hora_actual: format(now, 'HH:mm'), trabajadores: trabajadoresImplicados, categoria: categoriaSeleccionada ? `${categoriaSeleccionada.name} (${categoriaSeleccionada.gravedad})` : null, tiene_pruebas: tienePruebas > 0, num_pruebas: tienePruebas },
                });
                if (error) throw error;
                if (data?.error) throw new Error(data.error);
                const cleanText = data?.texto || descripcion;
                setDescripcion(cleanText);
                if (data?.fecha_extraida) setFechaIncidente(data.fecha_extraida);
                if (data?.hora_extraida) setHoraIncidente(data.hora_extraida);
                if (data?.pregunta_aclaracion) setPreguntaAclaracion(data.pregunta_aclaracion);
                toast.success("Texto mejorado con IA ✓");
              } catch { toast.error("No se pudo mejorar el texto"); }
              finally { setIsProcessingVoice(false); }
            }}
            className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            Mejorar con IA
          </button>
        )}
        {preguntaAclaracion && (
          <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-700 dark:text-amber-400">💡 {preguntaAclaracion}</p>
            <button onClick={() => setPreguntaAclaracion(null)} className="text-[10px] text-muted-foreground mt-1 hover:underline">Descartar</button>
          </div>
        )}
        {isFormal && descripcion.trim().length > 0 && descripcion.trim().length < 20 && (
          <p className="text-xs text-destructive mt-1">Mín. 20 caracteres ({descripcion.trim().length}/20)</p>
        )}
      </section>

      {/* ── 7. Suspension (only for Sanción, not positive) ────────────── */}
      <AnimatePresence>
        {!isPositiveMode && accionPropuesta === 'sancion' && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5 overflow-hidden"
          >
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Suspensión de empleo y sueldo</p>
                  <p className="text-[10px] text-muted-foreground">¿Proponer suspensión junto a la sanción?</p>
                </div>
                <Switch checked={propuestaSuspension} onCheckedChange={setPropuestaSuspension} />
              </div>
              {propuestaSuspension && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Fecha inicio sugerida</label>
                  <Popover open={suspensionPopoverOpen} onOpenChange={setSuspensionPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center justify-between w-full h-10 px-4 rounded-xl border border-border/40 bg-background text-sm hover:border-border transition-colors">
                        <span>{propuestaFechaInicio ? format(parse(propuestaFechaInicio, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : 'Seleccionar'}</span>
                        <CalendarDays className="h-4 w-4 text-primary opacity-70" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-xl border-border/40" align="start">
                      <Calendar
                        mode="single"
                        selected={propuestaFechaInicio ? parse(propuestaFechaInicio, 'yyyy-MM-dd', new Date()) : undefined}
                        onSelect={(date) => { if (date) { setPropuestaFechaInicio(format(date, 'yyyy-MM-dd')); setSuspensionPopoverOpen(false); } }}
                        locale={es}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── Submit button — at the end of form ────────────── */}
      <section className="mt-6 mb-8">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-14 rounded-2xl text-base font-semibold gap-2"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {accionPropuesta === 'solo_incidencia' ? 'Registrar incidencia' : accionPropuesta === 'amonestacion_escrita' ? 'Enviar amonestación' : 'Enviar sanción'}
          </Button>
          {!canSubmit && !submitting && (
            <p className="text-[10px] text-center text-muted-foreground mt-1.5">
              {!fechaIncidente ? '📅 Selecciona fecha' : !selectedCategory ? '🏷 Selecciona categoría' : isFormal && descripcion.trim().length < 20 ? '✏️ Descripción mín. 20 caracteres' : pruebas.some(p => p.uploading) ? '⏳ Subiendo archivos...' : ''}
            </p>
          )}
      </section>

      <SanctionSuggestionDialog
        open={showSuggestionDialog}
        onOpenChange={setShowSuggestionDialog}
        suggestions={sanctionSuggestions}
        onCreateAmonestacion={(s) => { setShowSuggestionDialog(false); onComplete({ departmentId: selectedDept, workerIds: [s.workerId], accionPropuesta: "amonestacion_escrita", skipToStep: 2 }); }}
        onCreateSancion={(s) => { setShowSuggestionDialog(false); onComplete({ departmentId: selectedDept, workerIds: [s.workerId], accionPropuesta: "sancion", skipToStep: 2 }); }}
        onDismiss={() => { setShowSuggestionDialog(false); onComplete(); }}
      />
    </div>
  );
}
