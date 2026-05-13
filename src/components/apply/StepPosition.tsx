import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";

type Props = {
  positions: Array<{ id: string; title: string; description: string }>;
  loading: boolean;
  selected: string;
  onSelect: (id: string, title: string) => void;
  onNext: () => void;
  onBack: () => void;
};

export function StepPosition({ positions, loading, selected, onSelect, onNext, onBack }: Props) {
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4">
        <p className="text-muted-foreground text-lg">{t("apply_no_positions")}</p>
      </div>
    );
  }

  // Auto-select single position
  if (positions.length === 1) {
    return (
      <div className="space-y-6">
        <StepNav onBack={onBack} />
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">{t("apply_applying_for")}</p>
          <h2 className="text-xl font-semibold">{positions[0].title}</h2>
          {positions[0].description && (
            <p className="text-sm text-muted-foreground">{positions[0].description}</p>
          )}
        </div>
        <Button size="lg" className="w-full h-14 text-lg rounded-xl" onClick={onNext}>
          {t("apply_next")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepNav onBack={onBack} />
      <h2 className="text-lg font-semibold">{t("apply_select_position")}</h2>
      <div className="space-y-3">
        {positions.map((pos) => (
          <Card
            key={pos.id}
            className={`cursor-pointer transition-all ${
              selected === pos.id
                ? "ring-2 ring-primary bg-primary/5"
                : "hover:bg-muted/50"
            }`}
            onClick={() => onSelect(pos.id, pos.title)}
          >
            <CardContent className="p-4">
              <h3 className="font-medium">{pos.title}</h3>
              {pos.description && (
                <p className="text-sm text-muted-foreground mt-1">{pos.description}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Button
        size="lg"
        className="w-full h-14 text-lg rounded-xl"
        onClick={onNext}
        disabled={!selected}
      >
        {t("apply_next")}
      </Button>
    </div>
  );
}

function StepNav({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage();
  return (
    <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
      <ChevronLeft className="h-4 w-4" />
      {t("apply_back")}
    </button>
  );
}
