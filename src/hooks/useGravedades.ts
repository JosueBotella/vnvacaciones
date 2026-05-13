import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GravedadConfig {
  id: string;
  key: string;
  label: string;
  label_plural: string;
  color: string;
  puntos: number;
  icon_name: string;
  sort_order: number;
  active: boolean;
}

const FALLBACK: GravedadConfig[] = [
  { id: "fallback-1", key: "leve", label: "Leve", label_plural: "Leves", color: "#93d600", puntos: 1, icon_name: "Shield", sort_order: 0, active: true },
  { id: "fallback-2", key: "moderada", label: "Moderada", label_plural: "Moderadas", color: "#fb923c", puntos: 10, icon_name: "Tag", sort_order: 1, active: true },
  { id: "fallback-3", key: "grave", label: "Grave", label_plural: "Graves", color: "#f59e0b", puntos: 25, icon_name: "AlertTriangle", sort_order: 2, active: true },
  { id: "fallback-4", key: "muy_grave", label: "Muy grave", label_plural: "Muy graves", color: "#ef4444", puntos: 80, icon_name: "ShieldAlert", sort_order: 3, active: true },
];

let cachedGravedades: GravedadConfig[] | null = null;
let cachePromise: Promise<GravedadConfig[]> | null = null;

async function fetchGravedades(): Promise<GravedadConfig[]> {
  const sessionToken = localStorage.getItem("manager_session_token") || "";
  const { data } = await supabase.functions.invoke("incidencias-operations", {
    body: { action: "listGravedades", sessionToken },
  });
  const list = data?.gravedades || [];
  return list.length > 0 ? list : FALLBACK;
}

export function useGravedades() {
  const [gravedades, setGravedades] = useState<GravedadConfig[]>(cachedGravedades || FALLBACK);
  const [loading, setLoading] = useState(!cachedGravedades);

  const reload = useCallback(async () => {
    setLoading(true);
    cachePromise = null;
    cachedGravedades = null;
    try {
      const result = await fetchGravedades();
      cachedGravedades = result;
      setGravedades(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedGravedades) {
      setGravedades(cachedGravedades);
      setLoading(false);
      return;
    }
    if (!cachePromise) {
      cachePromise = fetchGravedades();
    }
    cachePromise.then((result) => {
      cachedGravedades = result;
      setGravedades(result);
      setLoading(false);
    });
  }, []);

  // Helper: get config map keyed by gravedad key
  const configMap = gravedades.reduce<Record<string, GravedadConfig>>((acc, g) => {
    acc[g.key] = g;
    return acc;
  }, {});

  return { gravedades, loading, reload, configMap };
}
