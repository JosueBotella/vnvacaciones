import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoLink } from "@/components/LogoLink";
import { InvoiceMatchingPanel } from "@/components/invoice/InvoiceMatchingPanel";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const InvoiceMatching = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50">
        <div className="container mx-auto px-3 sm:px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <LogoLink to="/" className="h-8 w-8 object-contain" />
            <h1 className="text-lg font-semibold text-foreground tracking-tight">Cuadre de Facturas</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="container mx-auto px-3 sm:px-4 py-8 max-w-5xl">
        <InvoiceMatchingPanel />
      </main>
    </div>
  );
};

export default InvoiceMatching;
