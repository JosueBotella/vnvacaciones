import { useState, useCallback, useEffect, useRef } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, MapPin, Loader2 } from "lucide-react";
import type { ApplicationData } from "./ApplicationWizard";

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
};

type Props = {
  data: ApplicationData;
  updateData: (partial: Partial<ApplicationData>) => void;
  onNext: () => void;
  onBack: () => void;
};

export function StepAddress({ data, updateData, onNext, onBack }: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState(data.current_address || "");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showMap, setShowMap] = useState(!!data.current_lat);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const searchAddress = useCallback(async (q: string) => {
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=es&limit=5`,
        {
          headers: { "User-Agent": "VerdNatura-Candidaturas/1.0 (rrhh@verdnatura.es)" },
        }
      );
      const results: NominatimResult[] = await resp.json();
      setSuggestions(results);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddress(value), 600);
  };

  const selectSuggestion = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setQuery(result.display_name);
    updateData({
      current_address: result.display_name,
      current_lat: lat,
      current_lng: lng,
    });
    setSuggestions([]);
    setShowMap(true);
  };

  // Initialize Leaflet map
  useEffect(() => {
    if (!showMap || !mapContainerRef.current || !data.current_lat || !data.current_lng) return;

    const initMap = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");

      // Fix default icon path
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      if (mapRef.current) {
        mapRef.current.remove();
      }

      const map = L.map(mapContainerRef.current!, { zoomControl: false }).setView(
        [data.current_lat!, data.current_lng!],
        14
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OSM",
      }).addTo(map);

      const marker = L.marker([data.current_lat!, data.current_lng!], { draggable: true }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        updateData({ current_lat: pos.lat, current_lng: pos.lng });
      });

      mapRef.current = map;
      markerRef.current = marker;

      // Force resize after render
      setTimeout(() => map.invalidateSize(), 100);
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [showMap, data.current_lat, data.current_lng]);

  const canNext = !!data.current_address && data.current_lat !== null;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" />
        {t("apply_back")}
      </button>

      <h2 className="text-lg font-semibold">{t("apply_step_address")}</h2>

      <div className="relative">
        <div className="relative">
          <MapPin className="absolute start-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={t("apply_search_address")}
            className="h-12 text-base ps-10"
          />
          {searching && <Loader2 className="absolute end-3 top-3.5 h-5 w-5 animate-spin text-muted-foreground" />}
        </div>

        {suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="w-full text-start px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b last:border-b-0"
                onClick={() => selectSuggestion(s)}
              >
                <MapPin className="inline h-3.5 w-3.5 me-1.5 text-muted-foreground" />
                {s.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {showMap && (
        <div className="space-y-2">
          <div ref={mapContainerRef} className="h-48 rounded-xl overflow-hidden border" />
          <p className="text-xs text-muted-foreground text-center">{t("apply_drag_pin")}</p>
        </div>
      )}

      <Button
        size="lg"
        className="w-full h-14 text-lg rounded-xl"
        onClick={onNext}
        disabled={!canNext}
      >
        {t("apply_next")}
      </Button>
    </div>
  );
}
