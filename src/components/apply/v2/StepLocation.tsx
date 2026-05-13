import { useState, useCallback, useEffect, useRef } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { QuestionLayout } from "./QuestionLayout";
import { NextButton } from "./NextButton";
import { MapPin, Loader2, Search } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";

type NominatimResult = { display_name: string; lat: string; lon: string };

type Props = {
  address: string;
  lat: number | null;
  lng: number | null;
  onChange: (address: string, lat: number, lng: number) => void;
  onNext: () => void;
};

export function StepLocation({ address, lat, lng, onChange, onNext }: Props) {
  const { t } = useLanguage();
  const haptic = useHaptic();
  const [query, setQuery] = useState(address);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showMap, setShowMap] = useState(!!lat);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=es&limit=5`,
        { headers: { "User-Agent": "VerdNatura-Candidaturas/1.0" } },
      );
      setSuggestions(await resp.json());
    } catch { setSuggestions([]); }
    finally { setSearching(false); }
  }, []);

  const onInput = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 600);
  };

  const pick = (r: NominatimResult) => {
    haptic.light();
    setQuery(r.display_name);
    onChange(r.display_name, parseFloat(r.lat), parseFloat(r.lon));
    setSuggestions([]);
    setShowMap(true);
  };

  useEffect(() => {
    if (!showMap || !mapContainerRef.current || !lat || !lng) return;
    const init = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });
      if (mapRef.current) mapRef.current.remove();
      const map = L.map(mapContainerRef.current!, { zoomControl: false, attributionControl: false }).setView([lat, lng], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChange(query, p.lat, p.lng);
      });
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 100);
    };
    init();
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [showMap, lat, lng]);

  const canNext = !!address && lat !== null;

  return (
    <QuestionLayout
      title={t("apply_v2_location_title")}
      subtitle={t("apply_v2_location_subtitle")}
      footer={<NextButton onClick={() => { haptic.medium(); onNext(); }} disabled={!canNext} label={t("apply_v2_continue")} />}
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => onInput(e.target.value)}
            placeholder={t("apply_search_address")}
            inputMode="search"
            className="w-full h-14 rounded-2xl bg-card/60 border border-border ps-11 pe-12 text-base font-medium tracking-tight text-foreground placeholder:text-muted-foreground/60 placeholder:font-light focus:outline-none focus:border-primary/60 transition-all"
          />
          {searching && <Loader2 className="absolute end-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {suggestions.length > 0 && (
          <div className="rounded-2xl border bg-popover overflow-hidden max-h-52 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => pick(s)}
                className="w-full text-start px-4 py-3 text-sm font-light hover:bg-muted transition-colors border-b last:border-b-0 flex items-start gap-2"
              >
                <MapPin className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />
                <span className="leading-snug">{s.display_name}</span>
              </button>
            ))}
          </div>
        )}

        {showMap && (
          <div ref={mapContainerRef} className="h-44 rounded-2xl overflow-hidden border" />
        )}
      </div>
    </QuestionLayout>
  );
}
