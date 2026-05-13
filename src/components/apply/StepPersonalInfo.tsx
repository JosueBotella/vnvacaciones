import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, User, UserRound } from "lucide-react";
import { useState, useMemo } from "react";
import type { ApplicationData } from "./ApplicationWizard";

// Common countries list for autocomplete
const COUNTRIES_ES = [
  "Marruecos", "Senegal", "España", "Rumanía", "Colombia", "Ecuador", "Bolivia",
  "Perú", "Honduras", "Guatemala", "Nicaragua", "El Salvador", "República Dominicana",
  "Venezuela", "Argentina", "Chile", "México", "Brasil", "Paraguay", "Uruguay",
  "Mali", "Guinea", "Gambia", "Costa de Marfil", "Mauritania", "Nigeria", "Ghana",
  "Camerún", "Argelia", "Túnez", "Egipto", "Pakistán", "India", "Bangladesh",
  "China", "Filipinas", "Ucrania", "Bulgaria", "Polonia", "Portugal", "Francia",
  "Italia", "Alemania", "Reino Unido",
];

type Props = {
  data: ApplicationData;
  updateData: (partial: Partial<ApplicationData>) => void;
  onNext: () => void;
  onBack: () => void;
  showGender?: boolean;
  showCountry?: boolean;
};

export function StepPersonalInfo({ data, updateData, onNext, onBack, showGender = true, showCountry = true }: Props) {
  const { t } = useLanguage();
  const [countrySearch, setCountrySearch] = useState(data.origin_country);
  const [showCountries, setShowCountries] = useState(false);

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRIES_ES.slice(0, 10);
    const q = countrySearch.toLowerCase();
    return COUNTRIES_ES.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [countrySearch]);

  const canNext = data.first_name.trim() && data.last_name.trim() && (!showGender || data.gender) && (!showCountry || data.origin_country.trim());

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" />
        {t("apply_back")}
      </button>

      <h2 className="text-lg font-semibold">{t("apply_step_personal")}</h2>

      <div className="space-y-4">
        <div>
          <Label className="text-sm">{t("apply_first_name")}</Label>
          <Input
            value={data.first_name}
            onChange={(e) => updateData({ first_name: e.target.value })}
            className="h-12 text-base mt-1"
            autoComplete="given-name"
          />
        </div>

        <div>
          <Label className="text-sm">{t("apply_last_name")}</Label>
          <Input
            value={data.last_name}
            onChange={(e) => updateData({ last_name: e.target.value })}
            className="h-12 text-base mt-1"
            autoComplete="family-name"
          />
        </div>

        {showGender && (
        <div>
          <Label className="text-sm">{t("apply_gender")}</Label>
          <div className="grid grid-cols-2 gap-3 mt-1">
            {[
              { value: "male" as const, label: t("apply_male"), icon: User },
              { value: "female" as const, label: t("apply_female"), icon: UserRound },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => updateData({ gender: value })}
                className={`flex items-center justify-center gap-2 h-14 rounded-xl border-2 text-base font-medium transition-all ${
                  data.gender === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </div>
        )}

        {showCountry && (
        <div className="relative">
          <Label className="text-sm">{t("apply_origin_country")}</Label>
          <Input
            value={countrySearch}
            onChange={(e) => {
              setCountrySearch(e.target.value);
              updateData({ origin_country: e.target.value });
              setShowCountries(true);
            }}
            onFocus={() => setShowCountries(true)}
            onBlur={() => setTimeout(() => setShowCountries(false), 200)}
            className="h-12 text-base mt-1"
          />
          {showCountries && filteredCountries.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filteredCountries.map((country) => (
                <button
                  key={country}
                  className="w-full text-start px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCountrySearch(country);
                    updateData({ origin_country: country });
                    setShowCountries(false);
                  }}
                >
                  {country}
                </button>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

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
