import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { SignaturePad } from '@/components/SignaturePad';
import { 
  ArrowLeftRight, 
  Check, 
  X, 
  Calendar,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  PenLine
} from 'lucide-react';

interface ExchangeData {
  id: string;
  year: number;
  status: string;
  employee: {
    name: string;
    workerNumber: string;
  };
  originalGroup: {
    name: string;
    color: string;
  };
  temporaryGroup: {
    name: string;
    color: string;
  };
  otherEmployee: {
    name: string;
  };
  alreadyAccepted: boolean;
  alreadyRejected: boolean;
  originalGroupDates?: string[];
  temporaryGroupDates?: string[];
}

export default function ExchangeConfirmation() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exchangeData, setExchangeData] = useState<ExchangeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<'accepted' | 'rejected' | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    const fetchExchange = async () => {
      if (!token) {
        setError('Token no válido');
        setLoading(false);
        return;
      }

      try {
        const { data, error: fnError } = await supabase.functions.invoke('public-actions', {
          body: {
            action: 'getExchangeByToken',
            data: { token }
          }
        });

        if (fnError) throw fnError;

        if (data?.success && data?.exchange) {
          setExchangeData(data.exchange);
        } else {
          setError(data?.error || 'Intercambio no encontrado');
        }
      } catch (err) {
        console.error('Error:', err);
        setError('Error al cargar el intercambio');
      } finally {
        setLoading(false);
      }
    };

    fetchExchange();
  }, [token]);

  const handleResponse = async (accept: boolean) => {
    if (!token) return;

    if (accept && !signature) {
      setError('Por favor, firma y confirma tu firma antes de aceptar.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('public-actions', {
        body: {
          action: 'respondToExchange',
          data: { token, accept, signature: accept ? signature : null }
        }
      });

      if (fnError) throw fnError;

      if (data?.success) {
        setSuccess(accept ? 'accepted' : 'rejected');
      } else {
        setError(data?.error || 'Error al procesar respuesta');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Error al procesar tu respuesta');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !exchangeData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-xl font-semibold">Error</h2>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
                success === 'accepted' ? 'bg-primary/10' : 'bg-muted'
              }`}>
                {success === 'accepted' ? (
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                ) : (
                  <XCircle className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <h2 className="text-xl font-semibold">
                {success === 'accepted' ? '¡Intercambio Aceptado!' : 'Intercambio Rechazado'}
              </h2>
              <p className="text-muted-foreground">
                {success === 'accepted'
                  ? 'Has firmado y aceptado el intercambio. Cuando el otro empleado también lo haga, el cambio se aplicará automáticamente y el administrador será notificado.'
                  : 'Has rechazado el intercambio de grupo. El acuerdo no se llevará a cabo.'
                }
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!exchangeData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">No se encontró información del intercambio</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (exchangeData.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <XCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold">Intercambio Cancelado</h2>
              <p className="text-muted-foreground">
                Este intercambio ha sido cancelado y ya no está disponible.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (exchangeData.alreadyAccepted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Ya has aceptado</h2>
              <p className="text-muted-foreground">
                Ya has confirmado tu aceptación de este intercambio. El proceso continúa según el estado actual.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ArrowLeftRight className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Intercambio de Grupo de Vacaciones</CardTitle>
          <CardDescription>
            Revisa el acuerdo y firma para confirmarlo
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Year badge */}
          <div className="flex justify-center">
            <Badge variant="secondary" className="gap-2 text-base px-4 py-2">
              <Calendar className="h-4 w-4" />
              Año {exchangeData.year}
            </Badge>
          </div>

          {/* Employee info */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <div className="font-medium">{exchangeData.employee.name}</div>
            <div className="text-sm text-muted-foreground">Nº Empleado: {exchangeData.employee.workerNumber}</div>
          </div>

          {/* Exchange visualization */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 p-3 rounded-lg border text-center">
                <div className="text-xs text-muted-foreground mb-1">Tu grupo actual</div>
                <Badge 
                  variant="outline" 
                  className="text-sm"
                  style={{ borderColor: exchangeData.originalGroup.color, color: exchangeData.originalGroup.color }}
                >
                  {exchangeData.originalGroup.name}
                </Badge>
              </div>
              <ArrowLeftRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 p-3 rounded-lg border text-center bg-primary/5">
                <div className="text-xs text-muted-foreground mb-1">Grupo temporal</div>
                <Badge 
                  className="text-sm"
                  style={{ backgroundColor: exchangeData.temporaryGroup.color }}
                >
                  {exchangeData.temporaryGroup.name}
                </Badge>
              </div>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Intercambio con: <span className="font-medium text-foreground">{exchangeData.otherEmployee.name}</span>
            </div>
          </div>

          {/* Vacation dates comparison */}
          {(exchangeData.originalGroupDates?.length || exchangeData.temporaryGroupDates?.length) ? (
            <div className="space-y-3">
              <div className="text-sm font-medium">Días de vacaciones</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border space-y-1">
                  <div className="text-xs text-muted-foreground font-medium" style={{ color: exchangeData.originalGroup.color }}>
                    {exchangeData.originalGroup.name} (actual)
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(exchangeData.originalGroupDates || []).map(d => (
                      <Badge key={d} variant="outline" className="text-xs">
                        {new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </Badge>
                    ))}
                    {(!exchangeData.originalGroupDates?.length) && <span className="text-xs text-muted-foreground">Sin días asignados</span>}
                  </div>
                </div>
                <div className="p-3 rounded-lg border bg-primary/5 space-y-1">
                  <div className="text-xs text-muted-foreground font-medium" style={{ color: exchangeData.temporaryGroup.color }}>
                    {exchangeData.temporaryGroup.name} (nuevo)
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(exchangeData.temporaryGroupDates || []).map(d => (
                      <Badge key={d} variant="secondary" className="text-xs">
                        {new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </Badge>
                    ))}
                    {(!exchangeData.temporaryGroupDates?.length) && <span className="text-xs text-muted-foreground">Sin días asignados</span>}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <Separator />

          {/* Important notice */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Importante:</strong> Este intercambio es <strong>temporal</strong> y solo afecta al año {exchangeData.year}. 
              Tu grupo real no cambiará. Este acuerdo solo modifica el calendario de vacaciones para el año indicado.
            </AlertDescription>
          </Alert>

          {/* Signature */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <PenLine className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-medium">Firma de conformidad</div>
            </div>
            <SignaturePad
              onSignatureChange={setSignature}
              clearLabel="Borrar"
              confirmLabel="Confirmar firma"
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1 gap-2"
              onClick={() => handleResponse(false)}
              disabled={submitting}
            >
              <X className="h-4 w-4" />
              Rechazar
            </Button>
            <Button 
              className="flex-1 gap-2"
              onClick={() => handleResponse(true)}
              disabled={submitting || !signature}
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Firmar y Aceptar
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Cuando ambos empleados firmen, el intercambio se aplicará automáticamente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
