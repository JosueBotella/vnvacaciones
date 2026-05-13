import { useTheme } from "next-themes";

const LoadingScreen = () => {
  const { theme } = useTheme();
  const logoSrc = theme === 'dark' 
    ? '/images/verdnatura-logo-white.png' 
    : '/images/verdnatura-logo-green.png';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <img 
          src={logoSrc} 
          alt="Verdnatura" 
          className="h-16 md:h-20 animate-pulse"
        />
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <p className="text-muted-foreground text-sm font-light">Cargando...</p>
      </div>
    </div>
  );
};

export default LoadingScreen;
