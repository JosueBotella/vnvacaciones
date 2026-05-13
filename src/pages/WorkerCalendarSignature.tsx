import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Check, X, Calendar, Trash2, Plus, AlertCircle, Loader2, FileSignature, CheckCircle } from "lucide-react";
import { es, ar, fr } from "date-fns/locale";
import { SignaturePad } from "@/components/SignaturePad";
import LoadingScreen from "@/components/LoadingScreen";
import { safeFormatBackendDate } from "@/lib/dates";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLanguage } from "@/hooks/useLanguage";

type ModificationData = {
  id: string;
  worker_name: string;
  worker_number: string;
  department_name: string;
  work_group_name: string | null;
  work_group_color: string | null;
  new_group_name: string | null;
  new_group_color: string | null;
  modification_type: string;
  removed_group_days: string[];
  added_personal_days: { date: string; half_day: boolean }[];
  admin_reason: string;
  admin_name: string;
  status: string;
  signature: string | null;
  signed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  year: number;
  created_at: string;
};

const WorkerCalendarSignature = () => {
  const { token } = useParams<{ token: string }>();
  const { theme } = useTheme();
  const { t, language, isRTL } = useLanguage();
  
  const verdnaturaLogo = theme === 'dark' 
    ? '/images/verdnatura-logo-white.png' 
    : '/images/verdnatura-logo-green.png';

  // Get the correct locale for date formatting
  const dateLocale = language === 'ar' ? ar : language === 'fr' ? fr : es;
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modification, setModification] = useState<ModificationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [signature, setSignature] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => {
    if (token) {
      fetchModification();
    }
  }, [token]);

  const fetchModification = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-actions', {
        body: {
          action: 'getCalendarModificationByToken',
          data: { token }
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || 'Enlace no válido o expirado');
      }

      // Map the nested data to our expected format
      const mod = data.modification;
      const mappedModification: ModificationData = {
        id: mod.id,
        worker_name: mod.workers?.name || '',
        worker_number: mod.workers?.worker_number || '',
        department_name: mod.departments?.name || '',
        work_group_name: mod.original_group?.name || null,
        work_group_color: mod.original_group?.color || null,
        new_group_name: mod.new_group?.name || null,
        new_group_color: mod.new_group?.color || null,
        modification_type: mod.modification_type,
        removed_group_days: mod.removed_group_days || [],
        added_personal_days: mod.added_personal_days || [],
        admin_reason: mod.admin_reason,
        admin_name: mod.admin_name,
        status: mod.status,
        signature: mod.signature,
        signed_at: mod.signed_at,
        rejected_at: mod.rejected_at,
        rejection_reason: mod.rejection_reason,
        year: mod.year,
        created_at: mod.created_at,
      };

      setModification(mappedModification);
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Error al cargar la modificación');
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!signature) {
      toast.error(t("pleaseSign"));
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-actions', {
        body: {
          action: 'signCalendarModification',
          data: { token, signature }
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || t("signingError"));
      }

      toast.success(t("signatureConfirmedSuccess"));
      fetchModification();
    } catch (err: any) {
      console.error('Error:', err);
      toast.error(err.message || t("signingError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error(t("pleaseIndicateReason"));
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-actions', {
        body: {
          action: 'rejectCalendarModification',
          data: { token, rejectionReason: rejectionReason.trim() }
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || t("rejectingError"));
      }

      toast.success(t("signatureRejectedSuccess"));
      fetchModification();
    } catch (err: any) {
      console.error('Error:', err);
      toast.error(err.message || t("rejectingError"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-muted/50 to-background p-4" dir={isRTL ? "rtl" : "ltr"}>
        <Card className="max-w-md w-full shadow-lg border-destructive/20">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{t("errorLabel")}</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!modification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-muted/50 to-background p-4" dir={isRTL ? "rtl" : "ltr"}>
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{t("notFound")}</h2>
            <p className="text-muted-foreground">{t("modificationNotFound")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSigned = modification.status === 'signed';
  const isRejected = modification.status === 'rejected';
  const isPending = modification.status === 'pending_signature' || modification.status === 'pending';

  // Use the year from the modification data, or current year as fallback
  const displayYear = modification.year || new Date().getFullYear();

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? "rtl" : "ltr"}>
      {/* Top Bar - Matching PublicVacationForm style */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
        <LanguageSelector />
        <ThemeToggle />
      </div>
      
      <div className="flex-1 py-4 px-3 sm:py-6 sm:px-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-5">
            <div className="flex justify-center mb-3">
              <img 
                src={verdnaturaLogo} 
                alt="Verdnatura" 
                className="h-12 w-12 sm:h-14 sm:w-14 object-contain"
              />
            </div>
            <h1 className="text-lg sm:text-2xl font-semibold text-foreground mb-1 tracking-tight">
              {t("calendarModification")}
            </h1>
            <p className="text-sm text-muted-foreground font-light tracking-tight">
              {t("year")} {displayYear}
            </p>
          </div>

          {/* Status banner */}
        {(isSigned || isRejected) && (
          <Card className={`mb-6 border-2 ${
            isSigned ? 'border-primary/50 bg-primary/5' : 'border-destructive/50 bg-destructive/5'
          }`}>
            <CardContent className="py-6 text-center">
              {isSigned ? (
                <>
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="h-7 w-7 text-primary" />
                  </div>
                  <p className="font-semibold text-primary text-lg">{t("modificationSigned")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("signedOn")} {safeFormatBackendDate(modification.signed_at, "d MMMM yyyy HH:mm", { locale: dateLocale })}
                  </p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                    <X className="h-7 w-7 text-destructive" />
                  </div>
                  <p className="font-semibold text-destructive text-lg">{t("modificationRejected")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("rejectedOn")} {safeFormatBackendDate(modification.rejected_at, "d MMMM yyyy", { locale: dateLocale })}
                  </p>
                  {modification.rejection_reason && (
                    <p className="text-sm mt-3 p-3 bg-muted rounded-lg inline-block max-w-md">{modification.rejection_reason}</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Worker info card */}
        <Card className="mb-6 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm">
                👤
              </span>
              {t("workerData")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("name")}</p>
              <p className="font-medium">{modification.worker_name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("clockNumber")}</p>
              <p className="font-mono font-medium text-primary">{modification.worker_number}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("departmentLabel")}</p>
              <p className="font-medium">{modification.department_name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("vacationGroup")}</p>
              <div className="flex items-center gap-2">
                {modification.work_group_color && (
                  <div 
                    className="w-4 h-4 rounded-full border-2 border-background shadow-sm"
                    style={{ backgroundColor: modification.work_group_color }}
                  />
                )}
                <span className="font-medium">{modification.work_group_name || t("notAssigned")}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Modification details card */}
        <Card className="mb-6 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-primary" />
              </span>
              {t("proposedChanges")}
            </CardTitle>
            <CardDescription className="text-sm">
              {t("proposedChangesDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Admin reason */}
            <div className="p-4 bg-accent/50 rounded-lg border border-accent-foreground/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">{t("changeReason")}</p>
              <p className="text-sm italic">"{modification.admin_reason}"</p>
              <p className="text-xs text-muted-foreground mt-3">
                {t("managedBy")} <span className="font-medium text-foreground">{modification.admin_name}</span>
              </p>
            </div>

            {/* Removed days */}
            {modification.removed_group_days.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-destructive">
                  <Trash2 className="h-4 w-4" />
                  <p className="font-medium text-sm">{t("removedGroupDays")} ({modification.removed_group_days.length})</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {modification.removed_group_days.map(date => (
                    <Badge key={date} variant="outline" className="border-destructive/40 text-destructive bg-destructive/5 font-normal">
                      {safeFormatBackendDate(date, "d MMMM", { locale: dateLocale })}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Added days */}
            {modification.added_personal_days.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Plus className="h-4 w-4" />
                  <p className="font-medium text-sm">
                    {t("addedPersonalDays")} ({modification.added_personal_days.reduce((sum, d) => sum + (d.half_day ? 0.5 : 1), 0)})
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {modification.added_personal_days.map(day => (
                    <Badge key={day.date} variant="outline" className="border-primary/40 text-primary bg-primary/5 font-normal">
                      {safeFormatBackendDate(day.date, "d MMMM", { locale: dateLocale })}
                      {day.half_day && ` (${t("halfDayShort")})`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Group change */}
            {modification.new_group_name && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Calendar className="h-4 w-4" />
                  <p className="font-medium text-sm">{t("groupChange")}</p>
                </div>
                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    {modification.work_group_color && (
                      <div 
                        className="w-4 h-4 rounded-full border-2 border-background shadow-sm"
                        style={{ backgroundColor: modification.work_group_color }}
                      />
                    )}
                    <span className="line-through text-muted-foreground">{modification.work_group_name}</span>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-2">
                    {modification.new_group_color && (
                      <div 
                        className="w-4 h-4 rounded-full border-2 border-background shadow-sm"
                        style={{ backgroundColor: modification.new_group_color }}
                      />
                    )}
                    <span className="font-medium">{modification.new_group_name}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signature section */}
        {isPending && (
          <Card className="shadow-md border-primary/20">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileSignature className="h-4 w-4 text-primary" />
                </span>
                {t("signatureAgreement")}
              </CardTitle>
              <CardDescription className="text-sm">
                {t("signatureAgreementDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showRejectForm ? (
                <>
                  <SignaturePad 
                    onSignatureChange={setSignature}
                    clearLabel={t("clearSignature")}
                    confirmLabel={t("confirmSignature")}
                    signHereLabel={t("signHereLabel")}
                    confirmHintLabel={t("confirmSignatureHint")}
                  />
                  
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Button 
                      className="flex-1 gap-2 h-12 text-base font-medium"
                      onClick={handleSign}
                      disabled={submitting || !signature}
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {t("signAndConfirm")}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1 gap-2 h-12 text-base border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setShowRejectForm(true)}
                      disabled={submitting}
                    >
                      <X className="h-4 w-4" />
                      {t("reject")}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2">{t("rejectionReason")}</p>
                    <Textarea
                      placeholder={t("rejectionPlaceholder")}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="min-h-[100px] resize-none"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button 
                      variant="destructive" 
                      className="flex-1 gap-2 h-12"
                      onClick={handleReject}
                      disabled={submitting || !rejectionReason.trim()}
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      {t("confirmRejection")}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1 h-12"
                      onClick={() => setShowRejectForm(false)}
                      disabled={submitting}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Signature display */}
        {isSigned && modification.signature && (
          <Card className="shadow-md border-primary/20">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-primary">
                <CheckCircle className="h-5 w-5" />
                {t("registeredSignature")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-white rounded-lg p-4 border shadow-inner">
                <img 
                  src={modification.signature} 
                  alt={t("workerSignature")} 
                  className="max-h-32 mx-auto"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
          <div className="mt-10 text-center text-xs text-muted-foreground space-y-1">
            <p>{t("officialDocument")}</p>
            <p>© {new Date().getFullYear()} Verdnatura. {t("allRightsReserved")}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkerCalendarSignature;