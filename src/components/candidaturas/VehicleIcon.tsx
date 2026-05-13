import { PersonStanding, Bike, Car } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  vehicle: string;
  className?: string;
  size?: number;
};

// Custom skateboard icon (lucide doesn't include one)
const SkateIcon = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 14h18" />
    <path d="M5 14v1.5" />
    <path d="M19 14v1.5" />
    <circle cx="7" cy="18" r="1.5" />
    <circle cx="17" cy="18" r="1.5" />
  </svg>
);

export function VehicleIcon({ vehicle, className, size = 16 }: Props) {
  const common = cn("text-foreground/70", className);
  switch (vehicle) {
    case "none":
      return <PersonStanding size={size} className={common} aria-label="A pie" />;
    case "skate":
      return <SkateIcon size={size} className={common} />;
    case "bike":
      return <Bike size={size} className={common} aria-label="Bicicleta" />;
    case "car":
      return <Car size={size} className={common} aria-label="Coche" />;
    default:
      return <span className="text-muted-foreground text-xs">—</span>;
  }
}

export const VEHICLE_LABELS: Record<string, string> = {
  none: "A pie",
  skate: "Patinete",
  bike: "Bicicleta",
  car: "Coche",
};
