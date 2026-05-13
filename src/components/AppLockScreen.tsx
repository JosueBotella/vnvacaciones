import { useAppSettings } from '@/hooks/useAppSettings';
import { AlertTriangle, Wrench, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function AppLockScreen() {
  const { isLocked, userRole, isNearLimit, settings, isLoading } = useAppSettings();

  if (isLoading) return null;

  // Admin warning for near limit (non-blocking)
  if (userRole === 'admin' && isNearLimit && !isLocked) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-4">
        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">
            Aviso de uso
          </AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Estás cerca del límite del plan gratuito de Supabase.
            <span className="block text-sm mt-1 opacity-80">
              {settings?.current_rows?.toLocaleString()} / {settings?.max_rows?.toLocaleString()} filas utilizadas
            </span>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Not locked - render nothing
  if (!isLocked) return null;

  // Admin locked modal
  if (userRole === 'admin') {
    return (
      <Dialog open={true}>
        <DialogContent className="sm:max-w-lg" hideCloseButton>
          <DialogHeader className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Lock className="h-8 w-8 text-destructive" />
            </div>
            <DialogTitle className="text-xl">
              Aplicación bloqueada
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              La aplicación está bloqueada por haber alcanzado el límite del plan gratuito de Supabase.
              <span className="block mt-3 font-medium text-foreground">
                Activa el plan de pago para continuar usando la aplicación.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 space-y-3">
            <div className="rounded-lg bg-muted p-4 text-sm">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Filas utilizadas:</span>
                <span className="font-medium">{settings?.current_rows?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Límite del plan:</span>
                <span className="font-medium">{settings?.max_rows?.toLocaleString()}</span>
              </div>
            </div>
            <Button 
              className="w-full" 
              onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
            >
              Ir a Supabase Dashboard
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => window.location.reload()}
            >
              Recargar aplicación
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Non-admin maintenance screen
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <div className="mx-auto max-w-md px-6 text-center">
        <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
          <Wrench className="h-12 w-12 text-primary" />
        </div>
        
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">
          En mantenimiento
        </h1>
        
        <p className="mb-8 text-muted-foreground leading-relaxed">
          La web app se encuentra temporalmente en mantenimiento.
          <span className="block mt-2">
            Contacta con <span className="font-medium text-foreground">Álvaro</span> para solucionarlo.
          </span>
        </p>
        
        <div className="space-y-3">
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => window.location.reload()}
          >
            Intentar de nuevo
          </Button>
        </div>

        <div className="mt-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Trabajando en la solución</span>
        </div>
      </div>
    </div>
  );
}

// Higher-order component to disable write actions
export function withWriteProtection<T extends object>(
  WrappedComponent: React.ComponentType<T>
) {
  return function WriteProtectedComponent(props: T) {
    const { canWrite } = useAppSettings();
    
    return <WrappedComponent {...props} disabled={!canWrite} />;
  };
}
