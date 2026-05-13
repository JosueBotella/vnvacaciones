import { createContext, useContext, useState, ReactNode } from "react";

export type Language = "es" | "ar" | "fr";

type Translations = {
  [key: string]: {
    es: string;
    ar: string;
    fr: string;
  };
};

export const translations: Translations = {
  // Header
  vacationRequest: {
    es: "Solicitud de Vacaciones",
    ar: "طلب إجازة",
    fr: "Demande de Congés",
  },
  annualCalendar: {
    es: "Calendario Anual",
    ar: "التقويم السنوي",
    fr: "Calendrier Annuel",
  },
  mySchedule: {
    es: "Mi Horario",
    ar: "جدولي",
    fr: "Mon Horaire",
  },
  myCalendar: {
    es: "Mi Calendario",
    ar: "تقويمي",
    fr: "Mon Calendrier",
  },
  week: {
    es: "Semana",
    ar: "أسبوع",
    fr: "Semaine",
  },
  today: {
    es: "Hoy",
    ar: "اليوم",
    fr: "Aujourd'hui",
  },
  weeklySchedule: {
    es: "Horario Semanal",
    ar: "الجدول الأسبوعي",
    fr: "Horaire Hebdomadaire",
  },
  // Days of week (short)
  daySun: { es: "DOM", ar: "أحد", fr: "DIM" },
  dayMon: { es: "LUN", ar: "إثن", fr: "LUN" },
  dayTue: { es: "MAR", ar: "ثلا", fr: "MAR" },
  dayWed: { es: "MIÉ", ar: "أرب", fr: "MER" },
  dayThu: { es: "JUE", ar: "خمي", fr: "JEU" },
  dayFri: { es: "VIE", ar: "جمع", fr: "VEN" },
  daySat: { es: "SÁB", ar: "سبت", fr: "SAM" },
  // Months (short)
  monthJan: { es: "ene", ar: "يناير", fr: "jan" },
  monthFeb: { es: "feb", ar: "فبراير", fr: "fév" },
  monthMar: { es: "mar", ar: "مارس", fr: "mars" },
  monthApr: { es: "abr", ar: "أبريل", fr: "avr" },
  monthMay: { es: "may", ar: "مايو", fr: "mai" },
  monthJun: { es: "jun", ar: "يونيو", fr: "juin" },
  monthJul: { es: "jul", ar: "يوليو", fr: "juil" },
  monthAug: { es: "ago", ar: "أغسطس", fr: "août" },
  monthSep: { es: "sep", ar: "سبتمبر", fr: "sept" },
  monthOct: { es: "oct", ar: "أكتوبر", fr: "oct" },
  monthNov: { es: "nov", ar: "نوفمبر", fr: "nov" },
  monthDec: { es: "dic", ar: "ديسمبر", fr: "déc" },
  // Shift names
  shiftMorning: { es: "Mañana", ar: "صباح", fr: "Matin" },
  shiftAfternoon: { es: "Tarde", ar: "مساء", fr: "Après-midi" },
  shiftNight: { es: "Noche", ar: "ليل", fr: "Nuit" },
  shiftRest: { es: "Descanso", ar: "راحة", fr: "Repos" },
  endTime: { es: "fin", ar: "نهاية", fr: "fin" },
  allRightsReserved: { es: "Todos los derechos reservados.", ar: "جميع الحقوق محفوظة.", fr: "Tous droits réservés." },
  // Vacation warning translations
  vacationWarningTitle: {
    es: "Importante sobre las vacaciones",
    ar: "مهم بخصوص الإجازات",
    fr: "Important sur les vacances",
  },
  vacationWarningMessage: {
    es: "Aunque tu grupo tenga vacaciones marcadas, debes acceder a tu calendario de Sálix para confirmar que las tienes asignadas. Los nuevos pueden no tenerlas generadas aún. Consulta siempre pulsando en \"Mi Calendario\" de arriba.",
    ar: "حتى لو كانت مجموعتك لديها إجازات محددة، يجب عليك الوصول إلى تقويم Sálix للتأكد من أنها مخصصة لك. قد لا يكون لدى الموظفين الجدد إجازات مولدة بعد. تحقق دائماً بالضغط على \"تقويمي\" أعلاه.",
    fr: "Même si votre groupe a des vacances marquées, vous devez accéder à votre calendrier Sálix pour confirmer qu'elles vous sont attribuées. Les nouveaux peuvent ne pas encore les avoir générées. Consultez toujours en cliquant sur \"Mon Calendrier\" ci-dessus.",
  },
  viewSalixCalendar: {
    es: "Ver Calendario de Sálix",
    ar: "عرض تقويم Sálix",
    fr: "Voir Calendrier Sálix",
  },
  howGroupsWork: {
    es: "Funcionamiento",
    ar: "كيفية العمل",
    fr: "Fonctionnement",
  },
  howGroupsWorkExplanation: {
    es: "Letra sola (ej: A) = todos los subgrupos. Letra + número (ej: A1) = solo ese subgrupo.",
    ar: "حرف فقط (مثل: A) = جميع المجموعات الفرعية. حرف + رقم (مثل: A1) = تلك المجموعة الفرعية فقط.",
    fr: "Lettre seule (ex: A) = tous les sous-groupes. Lettre + numéro (ex: A1) = ce sous-groupe uniquement.",
  },
  viewMyGroup: {
    es: "Ver mi grupo",
    ar: "عرض مجموعتي",
    fr: "Voir mon groupe",
  },
  totalVacationDays: {
    es: "Total días vacaciones",
    ar: "إجمالي أيام العطلة",
    fr: "Total jours de congés",
  },
  freeAssignmentDays: {
    es: "Días libre asignación",
    ar: "أيام التخصيص الحر",
    fr: "Jours à libre affectation",
  },
  freeConfigDays: {
    es: "Libre configuración",
    ar: "تكوين حر",
    fr: "Libre configuration",
  },
  freeAssignmentUsed: {
    es: "Usados",
    ar: "مستخدمة",
    fr: "Utilisés",
  },
  freeAssignmentAvailable: {
    es: "Disponibles",
    ar: "متاحة",
    fr: "Disponibles",
  },
  freeAssignmentWarning: {
    es: "Los días de libre asignación pueden variar según las vacaciones de enero pendientes de confirmar en tu calendario.",
    ar: "قد تتغير أيام التخصيص الحر حسب إجازات يناير المعلقة في تقويمك.",
    fr: "Les jours à libre affectation peuvent varier selon les congés de janvier en attente de confirmation.",
  },
  general: {
    es: "Generales",
    ar: "عامة",
    fr: "Généraux",
  },
  group: {
    es: "Grupo",
    ar: "مجموعة",
    fr: "Groupe",
  },
  approved: {
    es: "Aprobados",
    ar: "موافق عليها",
    fr: "Approuvés",
  },
  myVacations: {
    es: "Mis vacaciones",
    ar: "إجازاتي",
    fr: "Mes congés",
  },
  pending: {
    es: "Pendientes",
    ar: "قيد الانتظار",
    fr: "En attente",
  },
  generalVacations: {
    es: "Vacaciones Generales",
    ar: "الإجازات العامة",
    fr: "Congés Généraux",
  },
  holiday: {
    es: "Festivo",
    ar: "عطلة",
    fr: "Jour férié",
  },
  groupVacations: {
    es: "Vacaciones grupo",
    ar: "إجازات المجموعة",
    fr: "Congés groupe",
  },
  myApprovedVacations: {
    es: "Mis vacaciones aprobadas",
    ar: "إجازاتي الموافق عليها",
    fr: "Mes congés approuvés",
  },
  pendingApproval: {
    es: "Pendiente de aprobación",
    ar: "في انتظار الموافقة",
    fr: "En attente d'approbation",
  },
  weekend: {
    es: "Fin de semana",
    ar: "نهاية الأسبوع",
    fr: "Week-end",
  },
  workday: {
    es: "Periodo No Vacacional",
    ar: "فترة غير إجازة",
    fr: "Période Non Vacances",
  },
  vacationPeriod: {
    es: "Periodo Vacacional",
    ar: "فترة إجازة",
    fr: "Période de congés",
  },
  vacationPeriodInfo: {
    es: "El periodo vacacional marca cuándo se pueden pedir vacaciones, pero no garantiza que todos los días estén disponibles, ya que algunos pueden estar bloqueados por organización.",
    ar: "تحدد فترة الإجازة متى يمكن طلب الإجازات، لكنها لا تضمن توفر جميع الأيام، حيث قد يتم حظر بعضها من قبل المنظمة.",
    fr: "La période de vacances indique quand les congés peuvent être demandés, mais ne garantit pas que tous les jours soient disponibles, car certains peuvent être bloqués par l'organisation.",
  },
  scheduleLoginSubtitle: {
    es: "Introduce tu número de fichar para acceder a tu horario",
    ar: "أدخل رقم عملك للوصول إلى جدولك",
    fr: "Entrez votre numéro d'employé pour accéder à votre horaire",
  },
  calendarLoginSubtitle: {
    es: "Introduce tu número de fichar para acceder a tu calendario",
    ar: "أدخل رقم عملك للوصول إلى تقويمك",
    fr: "Entrez votre numéro d'employé pour accéder à votre calendrier",
  },
  scheduleComingSoon: {
    es: "Tu horario estará disponible próximamente",
    ar: "سيكون جدولك متاحًا قريبًا",
    fr: "Votre horaire sera bientôt disponible",
  },
  scheduleComingSoonDesc: {
    es: "El departamento está configurando los horarios. Vuelve a consultar más tarde.",
    ar: "القسم يقوم بتكوين الجداول. تحقق مرة أخرى لاحقًا.",
    fr: "Le département configure les horaires. Revenez consulter plus tard.",
  },
  noTeamAssigned: {
    es: "No tienes un equipo asignado.",
    ar: "ليس لديك فريق معين.",
    fr: "Vous n'avez pas d'équipe assignée.",
  },
  noScheduleForWeek: {
    es: "No hay horario configurado para esta semana.",
    ar: "لا يوجد جدول مُعد لهذا الأسبوع.",
    fr: "Aucun horaire configuré pour cette semaine.",
  },
  schedulePendingReview: {
    es: "Pendiente de publicación",
    ar: "في انتظار النشر",
    fr: "En attente de publication",
  },
  schedulePendingReviewDesc: {
    es: "El horario de esta semana aún no ha sido publicado",
    ar: "لم يتم نشر جدول هذا الأسبوع بعد",
    fr: "L'horaire de cette semaine n'a pas encore été publié",
  },
  loadingSchedule: {
    es: "Cargando horario...",
    ar: "جار تحميل الجدول...",
    fr: "Chargement de l'horaire...",
  },
  loading: {
    es: "Cargando...",
    ar: "جار التحميل...",
    fr: "Chargement...",
  },
  invalidLink: {
    es: "Enlace no válido",
    ar: "رابط غير صالح",
    fr: "Lien invalide",
  },
  invalidLinkDesc: {
    es: "Este enlace no existe o ha expirado. Contacta con RRHH.",
    ar: "هذا الرابط غير موجود أو انتهت صلاحيته. تواصل مع الموارد البشرية.",
    fr: "Ce lien n'existe pas ou a expiré. Contactez les RH.",
  },
  
  // Form labels
  yourData: {
    es: "Tus Datos",
    ar: "بياناتك",
    fr: "Vos Informations",
  },
  completeYourInfo: {
    es: "Completa tu información personal",
    ar: "أكمل معلوماتك الشخصية",
    fr: "Complétez vos informations personnelles",
  },
  fullName: {
    es: "Nombre y Apellidos",
    ar: "الاسم الكامل",
    fr: "Nom et Prénoms",
  },
  fullNamePlaceholder: {
    es: "Juan Pérez García",
    ar: "محمد أحمد",
    fr: "Jean Dupont",
  },
  email: {
    es: "Email",
    ar: "البريد الإلكتروني",
    fr: "Email",
  },
  emailPlaceholder: {
    es: "juan.perez@ejemplo.com",
    ar: "mohamed@example.com",
    fr: "jean.dupont@exemple.com",
  },
  workerNumber: {
    es: "Número de Fichar",
    ar: "رقم العامل",
    fr: "Numéro d'Employé",
  },
  observations: {
    es: "Observaciones",
    ar: "ملاحظات",
    fr: "Observations",
  },
  observationsPlaceholder: {
    es: "Comentarios adicionales (opcional)",
    ar: "تعليقات إضافية (اختياري)",
    fr: "Commentaires supplémentaires (optionnel)",
  },
  
  // Calendar
  selectYourDays: {
    es: "Selecciona tus Días",
    ar: "اختر أيامك",
    fr: "Sélectionnez vos Jours",
  },
  tapDaysToSelect: {
    es: "Toca los días verdes para seleccionarlos",
    ar: "اضغط على الأيام الخضراء لاختيارها",
    fr: "Appuyez sur les jours verts pour les sélectionner",
  },
  available: {
    es: "Disponibles",
    ar: "متاح",
    fr: "Disponibles",
  },
  selected: {
    es: "Seleccionados",
    ar: "محدد",
    fr: "Sélectionnés",
  },
  daysOf: {
    es: "de",
    ar: "من",
    fr: "sur",
  },
  days: {
    es: "días",
    ar: "أيام",
    fr: "jours",
  },
  
  // Submit
  submitRequest: {
    es: "Enviar Solicitud",
    ar: "إرسال الطلب",
    fr: "Envoyer la Demande",
  },
  sending: {
    es: "Enviando...",
    ar: "جار الإرسال...",
    fr: "Envoi en cours...",
  },
  
  // Success
  requestSent: {
    es: "¡Solicitud Enviada!",
    ar: "تم إرسال الطلب!",
    fr: "Demande Envoyée !",
  },
  requestSentDesc: {
    es: "Tu solicitud ha sido enviada. RRHH la revisará y te contactará si es necesario.",
    ar: "تم إرسال طلبك. ستقوم الموارد البشرية بمراجعته والتواصل معك إذا لزم الأمر.",
    fr: "Votre demande a été envoyée. Les RH l'examineront et vous contacteront si nécessaire.",
  },
  summary: {
    es: "Resumen:",
    ar: "ملخص:",
    fr: "Résumé :",
  },
  department: {
    es: "Departamento:",
    ar: "القسم:",
    fr: "Département :",
  },
  requestedDays: {
    es: "Días solicitados:",
    ar: "الأيام المطلوبة:",
    fr: "Jours demandés :",
  },
  
  // Signature
  signature: {
    es: "Firma",
    ar: "التوقيع",
    fr: "Signature",
  },
  signatureDesc: {
    es: "Firma con el dedo o ratón",
    ar: "وقّع بإصبعك أو الماوس",
    fr: "Signez avec le doigt ou la souris",
  },
  signHere: {
    es: "✍️ Firma aquí",
    ar: "✍️ وقّع هنا",
    fr: "✍️ Signez ici",
  },
  clearSignature: {
    es: "Borrar",
    ar: "مسح",
    fr: "Effacer",
  },
  confirmSignature: {
    es: "Confirmar firma",
    ar: "تأكيد التوقيع",
    fr: "Confirmer la signature",
  },
  
  // Errors
  errorInvalidDate: {
    es: "Esta fecha no está disponible",
    ar: "هذا التاريخ غير متاح",
    fr: "Cette date n'est pas disponible",
  },
  errorMaxDays: {
    es: "Solo puedes seleccionar hasta",
    ar: "يمكنك اختيار حتى",
    fr: "Vous ne pouvez sélectionner que",
  },
  errorRequired: {
    es: "Nombre, email, número de fichar y firma son obligatorios",
    ar: "الاسم والبريد الإلكتروني ورقم العامل والتوقيع مطلوبة",
    fr: "Nom, email, numéro d'employé et signature sont obligatoires",
  },
  errorMissingFields: {
    es: "Faltan campos obligatorios",
    ar: "حقول مطلوبة مفقودة",
    fr: "Champs obligatoires manquants",
  },
  errorSelectDay: {
    es: "Debes seleccionar al menos un día",
    ar: "يجب اختيار يوم واحد على الأقل",
    fr: "Vous devez sélectionner au moins un jour",
  },
  selectDays: {
    es: "Selecciona días en el calendario",
    ar: "اختر أيامًا في التقويم",
    fr: "Sélectionnez des jours dans le calendrier",
  },
  beforeSubmitting: {
    es: "Antes de enviar",
    ar: "قبل الإرسال",
    fr: "Avant d'envoyer",
  },
  errorNoDaysAvailable: {
    es: "No te quedan días disponibles para solicitar",
    ar: "لا يوجد لديك أيام متاحة للطلب",
    fr: "Vous n'avez plus de jours disponibles à demander",
  },
  errorSubmit: {
    es: "Error al enviar solicitud",
    ar: "خطأ في إرسال الطلب",
    fr: "Erreur lors de l'envoi de la demande",
  },
  errorLoadDates: {
    es: "Error al cargar fechas disponibles",
    ar: "خطأ في تحميل التواريخ المتاحة",
    fr: "Erreur lors du chargement des dates disponibles",
  },
  errorInvalidLink: {
    es: "Este enlace no es válido",
    ar: "هذا الرابط غير صالح",
    fr: "Ce lien n'est pas valide",
  },
  mustSelectAllDays: {
    es: "Debes seleccionar todos los días disponibles",
    ar: "يجب اختيار جميع الأيام المتاحة",
    fr: "Vous devez sélectionner tous les jours disponibles",
  },
  
  // Instructions
  howToUse: {
    es: "¿Cómo funciona?",
    ar: "كيف يعمل؟",
    fr: "Comment ça marche ?",
  },
  step1: {
    es: "1. Rellena tus datos personales",
    ar: "1. أكمل بياناتك الشخصية",
    fr: "1. Remplissez vos informations personnelles",
  },
  step2: {
    es: "2. Toca los días verdes para seleccionarlos",
    ar: "2. اضغط على الأيام الخضراء لاختيارها",
    fr: "2. Appuyez sur les jours verts pour les sélectionner",
  },
  step3: {
    es: "3. Pulsa enviar solicitud",
    ar: "3. اضغط على إرسال الطلب",
    fr: "3. Appuyez sur envoyer la demande",
  },
  verifyHint: {
    es: "Pulsa \"Verificar\" para comprobar tus días disponibles",
    ar: "اضغط على \"تحقق\" للتحقق من أيامك المتاحة",
    fr: "Appuyez sur \"Vérifier\" pour consulter vos jours disponibles",
  },
  // Worker verification (generic department)
  verifyIdentity: {
    es: "Verificar Identidad",
    ar: "التحقق من الهوية",
    fr: "Vérifier l'identité",
  },
  verifyIdentityDesc: {
    es: "Introduce tu número de trabajador para acceder a tu calendario de vacaciones.",
    ar: "أدخل رقم العامل الخاص بك للوصول إلى تقويم إجازتك.",
    fr: "Entrez votre numéro d'employé pour accéder à votre calendrier de congés.",
  },
  workerNumberPlaceholder: {
    es: "Introduce tu número de trabajador",
    ar: "أدخل رقم العامل الخاص بك",
    fr: "Entrez votre numéro d'employé",
  },
  verifyAndContinue: {
    es: "Verificar y continuar",
    ar: "تحقق ومتابعة",
    fr: "Vérifier et continuer",
  },
  pendingRequestError: {
    es: "Ya tienes una solicitud pendiente para este departamento",
    ar: "لديك بالفعل طلب معلق لهذا القسم",
    fr: "Vous avez déjà une demande en attente pour ce département",
  },
  allDaysUsedError: {
    es: "Ya has utilizado todos tus días de vacaciones",
    ar: "لقد استخدمت بالفعل جميع أيام إجازتك",
    fr: "Vous avez déjà utilisé tous vos jours de congés",
  },
  availableDaysInfo: {
    es: "días disponibles",
    ar: "أيام متاحة",
    fr: "jours disponibles",
  },
  usedDaysOf: {
    es: "Has usado {used} de {total} días",
    ar: "لقد استخدمت {used} من {total} يوم",
    fr: "Vous avez utilisé {used} sur {total} jours",
  },
  fullDay: {
    es: "Día completo",
    ar: "يوم كامل",
    fr: "Journée complète",
  },
  halfDay: {
    es: "Medio día",
    ar: "نصف يوم",
    fr: "Demi-journée",
  },
  notAvailable: {
    es: "No disponible",
    ar: "غير متاح",
    fr: "Non disponible",
  },
  mondayFridayLimitTitle: {
    es: "Límite de lunes y viernes",
    ar: "حد الاثنين والجمعة",
    fr: "Limite des lundis et vendredis",
  },
  mondayFridayLimitDesc: {
    es: "Solo puedes seleccionar como máximo 1 lunes y 1 viernes entre tus días de libre configuración.",
    ar: "يمكنك اختيار يوم اثنين واحد ويوم جمعة واحد فقط كحد أقصى من أيام التكوين الحر.",
    fr: "Vous ne pouvez sélectionner qu'un maximum de 1 lundi et 1 vendredi parmi vos jours de libre configuration.",
  },
  maxMondaysReached: {
    es: "Ya has seleccionado 1 lunes (máximo permitido)",
    ar: "لقد اخترت بالفعل يوم اثنين واحد (الحد الأقصى المسموح به)",
    fr: "Vous avez déjà sélectionné 1 lundi (maximum autorisé)",
  },
  maxFridaysReached: {
    es: "Ya has seleccionado 1 viernes (máximo permitido)",
    ar: "لقد اخترت بالفعل يوم جمعة واحد (الحد الأقصى المسموح به)",
    fr: "Vous avez déjà sélectionné 1 vendredi (maximum autorisé)",
  },
  selectAtLeastOneDay: {
    es: "Selecciona al menos 1 día (máximo {max})",
    ar: "اختر يومًا واحدًا على الأقل (بحد أقصى {max})",
    fr: "Sélectionnez au moins 1 jour (maximum {max})",
  },
  workerNumberMismatch: {
    es: "El número de trabajador no coincide",
    ar: "رقم العامل غير متطابق",
    fr: "Le numéro d'employé ne correspond pas",
  },
  // Worker info display
  keepSessionActive: {
    es: "Mantener sesión iniciada",
    ar: "البقاء متصلاً",
    fr: "Rester connecté",
  },
  keepSessionActiveDesc: {
    es: "Para no tener que iniciar sesión cada vez",
    ar: "لعدم الحاجة لتسجيل الدخول في كل مرة",
    fr: "Pour ne pas avoir à se connecter à chaque fois",
  },
  team: {
    es: "Equipo",
    ar: "الفريق",
    fr: "Équipe",
  },
  vacationGroup: {
    es: "Grupo vacacional",
    ar: "مجموعة العطلات",
    fr: "Groupe de vacances",
  },
  searchingWorker: {
    es: "Buscando trabajador...",
    ar: "جاري البحث عن العامل...",
    fr: "Recherche de l'employé...",
  },
  // Not in group
  notInGroup: {
    es: "No perteneces a ningún grupo",
    ar: "لا تنتمي إلى أي مجموعة",
    fr: "Vous n'appartenez à aucun groupe",
  },
  notInGroupDesc: {
    es: "Tu número de trabajador no está asignado a ningún equipo o grupo vacacional.",
    ar: "رقم العامل الخاص بك غير مخصص لأي فريق أو مجموعة عطلات.",
    fr: "Votre numéro d'employé n'est assigné à aucune équipe ou groupe de vacances.",
  },
  requestJoinGroup: {
    es: "Solicitar ser añadido a un grupo",
    ar: "طلب إضافتك إلى مجموعة",
    fr: "Demander à être ajouté à un groupe",
  },
  joinRequestSent: {
    es: "Solicitud enviada",
    ar: "تم إرسال الطلب",
    fr: "Demande envoyée",
  },
  joinRequestSentDesc: {
    es: "Tu solicitud ha sido enviada al administrador. Te contactarán cuando seas añadido a un grupo.",
    ar: "تم إرسال طلبك إلى المسؤول. سيتم الاتصال بك عند إضافتك إلى مجموعة.",
    fr: "Votre demande a été envoyée à l'administrateur. Vous serez contacté lorsque vous serez ajouté à un groupe.",
  },
  fridayEqualsSunday: {
    es: "Cualquier día marcado en viernes equivale al domingo de esa semana.",
    ar: "أي يوم محدد يوم الجمعة يعادل يوم الأحد من نفس الأسبوع.",
    fr: "Tout jour marqué un vendredi équivaut au dimanche de cette semaine.",
  },
  important: {
    es: "Importante:",
    ar: "مهم:",
    fr: "Important :",
  },
  selectionModeHint: {
    es: "Selecciona \"{mode}\" arriba y pulsa en el calendario. Pulsa de nuevo para quitar.",
    ar: "اختر \"{mode}\" أعلاه واضغط على التقويم. اضغط مرة أخرى للإزالة.",
    fr: "Sélectionnez \"{mode}\" ci-dessus et cliquez sur le calendrier. Cliquez à nouveau pour supprimer.",
  },
  blockedDayTooltipTitle: {
    es: "Día bloqueado",
    ar: "يوم محظور",
    fr: "Jour bloqué",
  },
  blockedDayTooltipAction: {
    es: "Puedes seleccionarlo; pulsa para solicitar desbloqueo al encargado",
    ar: "يمكنك تحديده؛ اضغط لطلب إلغاء الحظر من المسؤول",
    fr: "Vous pouvez le sélectionner ; cliquez pour demander le déblocage au responsable",
  },
  blockedDaysHelpTitle: {
    es: "Días rojos (bloqueados)",
    ar: "الأيام الحمراء (محظورة)",
    fr: "Jours rouges (bloqués)",
  },
  blockedDaysHelpDesc: {
    es: "Puedes seleccionarlos, pero debes pedir desbloqueo al encargado: pulsa el día rojo y envía el motivo en “Solicitar excepción”.",
    ar: "يمكنك تحديدها، لكن يجب طلب إلغاء الحظر من المسؤول: اضغط على اليوم الأحمر وأرسل السبب في \"طلب استثناء\".",
    fr: "Vous pouvez les sélectionner, mais vous devez demander le déblocage au responsable : cliquez sur le jour rouge et envoyez le motif dans “Demander une exception”.",
  },
  // Worker Entry Page
  workerEntryTitle: {
    es: "Solicitud de Vacaciones",
    ar: "طلب إجازة",
    fr: "Demande de Congés",
  },
  workerEntrySubtitle: {
    es: "Introduce tu número de fichar para acceder a tu formulario",
    ar: "أدخل رقم الموظف للوصول إلى النموذج الخاص بك",
    fr: "Entrez votre numéro d'employé pour accéder à votre formulaire",
  },
  workerFound: {
    es: "Trabajador encontrado",
    ar: "تم العثور على العامل",
    fr: "Employé trouvé",
  },
  workerNotFound: {
    es: "No encontrado",
    ar: "غير موجود",
    fr: "Non trouvé",
  },
  workerNotFoundDesc: {
    es: "No se encontró ningún trabajador con ese número.",
    ar: "لم يتم العثور على عامل بهذا الرقم.",
    fr: "Aucun employé trouvé avec ce numéro.",
  },
  goToVacationForm: {
    es: "Solicitar vacaciones",
    ar: "طلب إجازة",
    fr: "Demander des congés",
  },
  name: {
    es: "Nombre",
    ar: "الاسم",
    fr: "Nom",
  },
  continue: {
    es: "Continuar",
    ar: "متابعة",
    fr: "Continuer",
  },
  enterWorkerNumber: {
    es: "Introduce tu número de fichar",
    ar: "أدخل رقم الموظف",
    fr: "Entrez votre numéro d'employé",
  },
  errorSearchingWorker: {
    es: "Error al buscar trabajador",
    ar: "خطأ في البحث عن العامل",
    fr: "Erreur lors de la recherche de l'employé",
  },
  pendingRequestExists: {
    es: "Ya tienes una solicitud pendiente de revisión",
    ar: "لديك بالفعل طلب قيد المراجعة",
    fr: "Vous avez déjà une demande en cours de révision",
  },
  allDaysUsed: {
    es: "Ya has usado todos tus días de vacaciones",
    ar: "لقد استخدمت بالفعل جميع أيام إجازتك",
    fr: "Vous avez déjà utilisé tous vos jours de congés",
  },
  errorLoadingForm: {
    es: "Error al cargar el formulario",
    ar: "خطأ في تحميل النموذج",
    fr: "Erreur lors du chargement du formulaire",
  },
  completeAllFields: {
    es: "Completa todos los campos",
    ar: "أكمل جميع الحقول",
    fr: "Remplissez tous les champs",
  },
  requestSentSuccess: {
    es: "Solicitud enviada correctamente",
    ar: "تم إرسال الطلب بنجاح",
    fr: "Demande envoyée avec succès",
  },
  vacations: {
    es: "Vacaciones",
    ar: "إجازات",
    fr: "Congés",
  },
  requestSubmitted: {
    es: "¡Solicitud enviada!",
    ar: "تم إرسال الطلب!",
    fr: "Demande envoyée !",
  },
  requestSubmittedDesc: {
    es: "Tu solicitud de vacaciones ha sido registrada correctamente. Recibirás un email de confirmación.",
    ar: "تم تسجيل طلب إجازتك بنجاح. ستتلقى بريدًا إلكترونيًا للتأكيد.",
    fr: "Votre demande de congés a été enregistrée. Vous recevrez un email de confirmation.",
  },
  daysRequested: {
    es: "día(s) solicitado(s)",
    ar: "يوم (أيام) مطلوب(ة)",
    fr: "jour(s) demandé(s)",
  },
  mustSelectExactDays: {
    es: "Debes seleccionar exactamente {days} días",
    ar: "يجب اختيار {days} يوم (أيام) بالضبط",
    fr: "Vous devez sélectionner exactement {days} jour(s)",
  },
  canSelectUpTo: {
    es: "Solo puedes seleccionar hasta {days} días más",
    ar: "يمكنك اختيار حتى {days} يوم (أيام) إضافي(ة)",
    fr: "Vous ne pouvez sélectionner que {days} jour(s) de plus",
  },
  completeRequiredFields: {
    es: "Completa todos los campos obligatorios",
    ar: "أكمل جميع الحقول المطلوبة",
    fr: "Remplissez tous les champs obligatoires",
  },
  requestToJoinGroup: {
    es: "Solicitar unirse a un grupo",
    ar: "طلب الانضمام إلى مجموعة",
    fr: "Demander à rejoindre un groupe",
  },
  sendRequest: {
    es: "Enviar solicitud",
    ar: "إرسال الطلب",
    fr: "Envoyer la demande",
  },
  requestSentSuccessfully: {
    es: "Solicitud enviada correctamente",
    ar: "تم إرسال الطلب بنجاح",
    fr: "Demande envoyée avec succès",
  },
  errorSendingRequest: {
    es: "Error al enviar solicitud",
    ar: "خطأ في إرسال الطلب",
    fr: "Erreur lors de l'envoi de la demande",
  },
  onlyCanSelectMoreDays: {
    es: "Solo puedes seleccionar {days} días más",
    ar: "يمكنك اختيار {days} يوم (أيام) إضافي(ة) فقط",
    fr: "Vous ne pouvez sélectionner que {days} jour(s) de plus",
  },
  onlyOneHalfDay: {
    es: "Solo puedes seleccionar un máximo de 1 medio día",
    ar: "يمكنك اختيار نصف يوم واحد كحد أقصى",
    fr: "Vous ne pouvez sélectionner qu'une demi-journée maximum",
  },
  mustSelectAtLeastOneDay: {
    es: "Debes seleccionar al menos 1 día",
    ar: "يجب اختيار يوم واحد على الأقل",
    fr: "Vous devez sélectionner au moins 1 jour",
  },
  cancel: {
    es: "Cancelar",
    ar: "إلغاء",
    fr: "Annuler",
  },
  // Department correction request
  wrongDepartmentQuestion: {
    es: "¿No perteneces a este departamento?",
    ar: "ألا تنتمي إلى هذا القسم؟",
    fr: "Vous n'appartenez pas à ce département ?",
  },
  selectCorrectDepartment: {
    es: "Selecciona el departamento correcto",
    ar: "اختر القسم الصحيح",
    fr: "Sélectionnez le bon département",
  },
  sendCorrectionRequest: {
    es: "Enviar solicitud de corrección",
    ar: "إرسال طلب التصحيح",
    fr: "Envoyer une demande de correction",
  },
  sendCorrection: {
    es: "Enviar corrección",
    ar: "إرسال التصحيح",
    fr: "Envoyer la correction",
  },
  back: {
    es: "Volver",
    ar: "رجوع",
    fr: "Retour",
  },
  correctionRequestSent: {
    es: "Solicitud de corrección enviada",
    ar: "تم إرسال طلب التصحيح",
    fr: "Demande de correction envoyée",
  },
  correctionRequestSentDesc: {
    es: "Tu solicitud ha sido enviada. No podrás acceder al formulario de vacaciones hasta que sea revisada.",
    ar: "تم إرسال طلبك. لن تتمكن من الوصول إلى نموذج الإجازة حتى تتم مراجعته.",
    fr: "Votre demande a été envoyée. Vous ne pourrez pas accéder au formulaire de congés tant qu'elle n'aura pas été examinée.",
  },
  pendingCorrectionRequest: {
    es: "Tienes una solicitud de corrección pendiente",
    ar: "لديك طلب تصحيح معلق",
    fr: "Vous avez une demande de correction en attente",
  },
  pendingCorrectionRequestDesc: {
    es: "No puedes acceder al formulario de vacaciones hasta que tu solicitud de cambio de departamento sea procesada.",
    ar: "لا يمكنك الوصول إلى نموذج الإجازة حتى تتم معالجة طلب تغيير القسم.",
    fr: "Vous ne pouvez pas accéder au formulaire de congés tant que votre demande de changement de département n'a pas été traitée.",
  },
  errorSendingCorrectionRequest: {
    es: "Error al enviar la solicitud de corrección",
    ar: "خطأ في إرسال طلب التصحيح",
    fr: "Erreur lors de l'envoi de la demande de correction",
  },
  // Additional form translations
  calendar: {
    es: "Calendario",
    ar: "التقويم",
    fr: "Calendrier",
  },
  groups: {
    es: "Grupos",
    ar: "المجموعات",
    fr: "Groupes",
  },
  viewAnnualCalendar: {
    es: "Ver calendario...",
    ar: "عرض التقويم...",
    fr: "Voir calendrier...",
  },
  viewSchedule: {
    es: "Ver horario",
    ar: "عرض الجدول",
    fr: "Voir horaire",
  },
  viewGroups: {
    es: "Ver mi grupo",
    ar: "عرض مجموعتي",
    fr: "Voir mon groupe",
  },
  availableDays: {
    es: "Días disponibles",
    ar: "الأيام المتاحة",
    fr: "Jours disponibles",
  },
  selectedDays: {
    es: "Seleccionados",
    ar: "المختارة",
    fr: "Sélectionnés",
  },
  selectYourVacationDays: {
    es: "Selecciona tus días de vacaciones",
    ar: "اختر أيام إجازتك",
    fr: "Sélectionnez vos jours de congés",
  },
  clickAvailableDays: {
    es: "Haz clic en los días disponibles para seleccionarlos",
    ar: "اضغط على الأيام المتاحة لاختيارها",
    fr: "Cliquez sur les jours disponibles pour les sélectionner",
  },
  fullNameRequired: {
    es: "Nombre completo",
    ar: "الاسم الكامل",
    fr: "Nom complet",
  },
  workerNumberRequired: {
    es: "Número de fichar",
    ar: "رقم الموظف",
    fr: "Numéro d'employé",
  },
  emailRequired: {
    es: "Email",
    ar: "البريد الإلكتروني",
    fr: "Email",
  },
  observationsOptional: {
    es: "Observaciones (opcional)",
    ar: "ملاحظات (اختياري)",
    fr: "Observations (optionnel)",
  },
  signatureRequired: {
    es: "Firma",
    ar: "التوقيع",
    fr: "Signature",
  },
  drawSignature: {
    es: "Dibuja tu firma para confirmar la solicitud",
    ar: "ارسم توقيعك لتأكيد الطلب",
    fr: "Dessinez votre signature pour confirmer la demande",
  },
  submitVacationRequest: {
    es: "Enviar solicitud de vacaciones",
    ar: "إرسال طلب الإجازة",
    fr: "Envoyer la demande de congés",
  },
  contactData: {
    es: "Datos de contacto",
    ar: "بيانات الاتصال",
    fr: "Coordonnées",
  },
  additionalNotes: {
    es: "Notas adicionales...",
    ar: "ملاحظات إضافية...",
    fr: "Notes supplémentaires...",
  },
  // Worker Authentication
  password: {
    es: "Contraseña",
    ar: "كلمة المرور",
    fr: "Mot de passe",
  },
  passwordPlaceholder: {
    es: "Introduce tu contraseña",
    ar: "أدخل كلمة المرور",
    fr: "Entrez votre mot de passe",
  },
  changeNumber: {
    es: "Cambiar número",
    ar: "تغيير الرقم",
    fr: "Changer de numéro",
  },
  invalidSession: {
    es: "Sesión no válida. Por favor, inicia sesión.",
    ar: "جلسة غير صالحة. يرجى تسجيل الدخول.",
    fr: "Session invalide. Veuillez vous connecter.",
  },
  workerInfoNotFound: {
    es: "No se encontró información del trabajador",
    ar: "لم يتم العثور على معلومات العامل",
    fr: "Informations de l'employé introuvables",
  },
  workerLoadError: {
    es: "Error al cargar datos del trabajador",
    ar: "خطأ في تحميل بيانات العامل",
    fr: "Erreur lors du chargement des données de l'employé",
  },
  login: {
    es: "Iniciar sesión",
    ar: "تسجيل الدخول",
    fr: "Se connecter",
  },
  createAccount: {
    es: "Crear cuenta",
    ar: "إنشاء حساب",
    fr: "Créer un compte",
  },
  registerAccount: {
    es: "Registrar cuenta",
    ar: "تسجيل الحساب",
    fr: "Enregistrer le compte",
  },
  firstTimeSetup: {
    es: "Primera vez - Configura tu cuenta",
    ar: "المرة الأولى - إعداد حسابك",
    fr: "Première fois - Configurez votre compte",
  },
  firstTimeSetupDesc: {
    es: "Crea una contraseña para acceder a tus solicitudes de vacaciones de forma segura",
    ar: "أنشئ كلمة مرور للوصول إلى طلبات إجازتك بشكل آمن",
    fr: "Créez un mot de passe pour accéder à vos demandes de congés en toute sécurité",
  },
  confirmPassword: {
    es: "Confirmar contraseña",
    ar: "تأكيد كلمة المرور",
    fr: "Confirmer le mot de passe",
  },
  passwordMinLength: {
    es: "La contraseña debe tener al menos 6 caracteres",
    ar: "يجب أن تكون كلمة المرور 6 أحرف على الأقل",
    fr: "Le mot de passe doit contenir au moins 6 caractères",
  },
  passwordsDontMatch: {
    es: "Las contraseñas no coinciden",
    ar: "كلمات المرور غير متطابقة",
    fr: "Les mots de passe ne correspondent pas",
  },
  accountCreated: {
    es: "¡Cuenta creada correctamente!",
    ar: "تم إنشاء الحساب بنجاح!",
    fr: "Compte créé avec succès !",
  },
  invalidPassword: {
    es: "Contraseña incorrecta",
    ar: "كلمة المرور غير صحيحة",
    fr: "Mot de passe incorrect",
  },
  forgotPassword: {
    es: "¿Olvidaste tu contraseña?",
    ar: "هل نسيت كلمة المرور؟",
    fr: "Mot de passe oublié ?",
  },
  resetPassword: {
    es: "Restablecer contraseña",
    ar: "إعادة تعيين كلمة المرور",
    fr: "Réinitialiser le mot de passe",
  },
  resetPasswordSent: {
    es: "Te hemos enviado un email para restablecer tu contraseña",
    ar: "لقد أرسلنا لك بريدًا إلكترونيًا لإعادة تعيين كلمة المرور",
    fr: "Nous vous avons envoyé un email pour réinitialiser votre mot de passe",
  },
  resetPasswordDesc: {
    es: "Revisa tu bandeja de entrada y sigue las instrucciones",
    ar: "تحقق من صندوق الوارد واتبع التعليمات",
    fr: "Vérifiez votre boîte de réception et suivez les instructions",
  },
  enterYourPassword: {
    es: "Introduce tu contraseña para continuar",
    ar: "أدخل كلمة المرور للمتابعة",
    fr: "Entrez votre mot de passe pour continuer",
  },
  registering: {
    es: "Creando cuenta...",
    ar: "جاري إنشاء الحساب...",
    fr: "Création du compte...",
  },
  loggingIn: {
    es: "Iniciando sesión...",
    ar: "جاري تسجيل الدخول...",
    fr: "Connexion en cours...",
  },
  sendingResetEmail: {
    es: "Enviando email...",
    ar: "جاري إرسال البريد...",
    fr: "Envoi de l'email...",
  },
  newPassword: {
    es: "Nueva contraseña",
    ar: "كلمة المرور الجديدة",
    fr: "Nouveau mot de passe",
  },
  updatePassword: {
    es: "Actualizar contraseña",
    ar: "تحديث كلمة المرور",
    fr: "Mettre à jour le mot de passe",
  },
  passwordUpdated: {
    es: "Contraseña actualizada correctamente",
    ar: "تم تحديث كلمة المرور بنجاح",
    fr: "Mot de passe mis à jour avec succès",
  },
  emailAlreadyUsed: {
    es: "Este email ya está en uso por otro trabajador",
    ar: "هذا البريد الإلكتروني مستخدم بالفعل من قبل عامل آخر",
    fr: "Cet email est déjà utilisé par un autre employé",
  },
  // Urgent request message for blocked days
  urgentRequestTitle: {
    es: "Días no disponibles",
    ar: "أيام غير متاحة",
    fr: "Jours non disponibles",
  },
  urgentRequestMessage: {
    es: "Los días marcados en rojo no están disponibles (cupo completo). Solo se harán excepciones muy puntuales por motivos urgentes.",
    ar: "الأيام المحددة باللون الأحمر غير متاحة (الحصة ممتلئة). سيتم إجراء استثناءات فقط لأسباب عاجلة جدًا.",
    fr: "Les jours marqués en rouge ne sont pas disponibles (quota complet). Seules des exceptions très ponctuelles seront faites pour des raisons urgentes.",
  },
  urgentRequestButton: {
    es: "Solicitar excepción",
    ar: "طلب استثناء",
    fr: "Demander une exception",
  },
  urgentRequestModalTitle: {
    es: "Solicitar excepción urgente",
    ar: "طلب استثناء عاجل",
    fr: "Demander une exception urgente",
  },
  urgentRequestModalDesc: {
    es: "Este día está completo. Solo se aprobarán excepciones por motivos muy urgentes (emergencias familiares, médicas, etc.).",
    ar: "هذا اليوم ممتلئ. ستتم الموافقة على الاستثناءات فقط لأسباب عاجلة جدًا (حالات طوارئ عائلية، طبية، إلخ).",
    fr: "Ce jour est complet. Seules les exceptions pour des raisons très urgentes seront approuvées (urgences familiales, médicales, etc.).",
  },
  urgentRequestReasonLabel: {
    es: "Motivo de la urgencia *",
    ar: "سبب الاستعجال *",
    fr: "Raison de l'urgence *",
  },
  urgentRequestReasonPlaceholder: {
    es: "Explica brevemente por qué necesitas este día específico...",
    ar: "اشرح باختصار لماذا تحتاج هذا اليوم بالتحديد...",
    fr: "Expliquez brièvement pourquoi vous avez besoin de ce jour précis...",
  },
  urgentRequestSubmit: {
    es: "Enviar solicitud de excepción",
    ar: "إرسال طلب الاستثناء",
    fr: "Envoyer la demande d'exception",
  },
  urgentRequestSuccess: {
    es: "Solicitud enviada. El encargado revisará tu petición.",
    ar: "تم إرسال الطلب. سيراجع المشرف طلبك.",
    fr: "Demande envoyée. Le responsable examinera votre demande.",
  },
  urgentRequestAlreadyPending: {
    es: "Ya tienes una solicitud pendiente para este día",
    ar: "لديك بالفعل طلب معلق لهذا اليوم",
    fr: "Vous avez déjà une demande en attente pour ce jour",
  },
  dayBlockedByConcurrency: {
    es: "Este día está completo por límite de personal",
    ar: "هذا اليوم ممتلئ بسبب حد الموظفين",
    fr: "Ce jour est complet en raison de la limite du personnel",
  },
  clickBlockedDayHint: {
    es: "Pulsa sobre un día rojo para solicitar una excepción",
    ar: "اضغط على يوم أحمر لطلب استثناء",
    fr: "Appuyez sur un jour rouge pour demander une exception",
  },
  // Month names
  january: { es: "Enero", ar: "يناير", fr: "Janvier" },
  february: { es: "Febrero", ar: "فبراير", fr: "Février" },
  march: { es: "Marzo", ar: "مارس", fr: "Mars" },
  april: { es: "Abril", ar: "أبريل", fr: "Avril" },
  may: { es: "Mayo", ar: "مايو", fr: "Mai" },
  june: { es: "Junio", ar: "يونيو", fr: "Juin" },
  july: { es: "Julio", ar: "يوليو", fr: "Juillet" },
  august: { es: "Agosto", ar: "أغسطس", fr: "Août" },
  september: { es: "Septiembre", ar: "سبتمبر", fr: "Septembre" },
  october: { es: "Octubre", ar: "أكتوبر", fr: "Octobre" },
  november: { es: "Noviembre", ar: "نوفمبر", fr: "Novembre" },
  december: { es: "Diciembre", ar: "ديسمبر", fr: "Décembre" },
  // Day names short
  monday: { es: "L", ar: "ن", fr: "L" },
  tuesday: { es: "M", ar: "ث", fr: "M" },
  wednesday: { es: "X", ar: "ر", fr: "M" },
  thursday: { es: "J", ar: "خ", fr: "J" },
  friday: { es: "V", ar: "ج", fr: "V" },
  saturday: { es: "S", ar: "س", fr: "S" },
  sunday: { es: "D", ar: "ح", fr: "D" },
  // Long day names
  mondayLong: { es: "lunes", ar: "الاثنين", fr: "lundi" },
  tuesdayLong: { es: "martes", ar: "الثلاثاء", fr: "mardi" },
  wednesdayLong: { es: "miércoles", ar: "الأربعاء", fr: "mercredi" },
  thursdayLong: { es: "jueves", ar: "الخميس", fr: "jeudi" },
  fridayLong: { es: "viernes", ar: "الجمعة", fr: "vendredi" },
  saturdayLong: { es: "sábado", ar: "السبت", fr: "samedi" },
  sundayLong: { es: "domingo", ar: "الأحد", fr: "dimanche" },
  // Date connector
  of: { es: "de", ar: "من", fr: "" },
  // Non-vacation period
  nonVacationPeriod: { es: "Periodo No Vacacional", ar: "فترة غير إجازة", fr: "Période Non Vacances" },
  
  // Calendar Modification Signature Page
  calendarModification: {
    es: "Modificación de Calendario Personal",
    ar: "تعديل التقويم الشخصي",
    fr: "Modification du Calendrier Personnel",
  },
  year: {
    es: "Año",
    ar: "السنة",
    fr: "Année",
  },
  modificationSigned: {
    es: "Modificación Firmada",
    ar: "تم التوقيع على التعديل",
    fr: "Modification Signée",
  },
  signedOn: {
    es: "Firmado el",
    ar: "تم التوقيع في",
    fr: "Signé le",
  },
  modificationRejected: {
    es: "Modificación Rechazada",
    ar: "تم رفض التعديل",
    fr: "Modification Refusée",
  },
  rejectedOn: {
    es: "Rechazado el",
    ar: "تم الرفض في",
    fr: "Rejeté le",
  },
  workerData: {
    es: "Datos del trabajador",
    ar: "بيانات العامل",
    fr: "Données de l'employé",
  },
  clockNumber: {
    es: "Número de fichar",
    ar: "رقم البطاقة",
    fr: "Numéro de pointage",
  },
  departmentLabel: {
    es: "Departamento",
    ar: "القسم",
    fr: "Département",
  },
  notAssigned: {
    es: "Sin asignar",
    ar: "غير معين",
    fr: "Non attribué",
  },
  proposedChanges: {
    es: "Cambios propuestos",
    ar: "التغييرات المقترحة",
    fr: "Modifications proposées",
  },
  proposedChangesDesc: {
    es: "Se ha propuesto el siguiente cambio extraordinario en tu calendario de vacaciones:",
    ar: "تم اقتراح التغيير الاستثنائي التالي في تقويم إجازاتك:",
    fr: "La modification extraordinaire suivante a été proposée pour votre calendrier de congés:",
  },
  changeReason: {
    es: "Motivo del cambio",
    ar: "سبب التغيير",
    fr: "Motif du changement",
  },
  managedBy: {
    es: "Gestionado por:",
    ar: "تمت الإدارة بواسطة:",
    fr: "Géré par:",
  },
  removedGroupDays: {
    es: "Días de grupo eliminados",
    ar: "أيام المجموعة المحذوفة",
    fr: "Jours de groupe supprimés",
  },
  addedPersonalDays: {
    es: "Días personales añadidos",
    ar: "الأيام الشخصية المضافة",
    fr: "Jours personnels ajoutés",
  },
  halfDayShort: {
    es: "½ día",
    ar: "نصف يوم",
    fr: "½ jour",
  },
  groupChange: {
    es: "Cambio de grupo vacacional",
    ar: "تغيير مجموعة الإجازات",
    fr: "Changement de groupe de congés",
  },
  signatureAgreement: {
    es: "Firma de conformidad",
    ar: "توقيع الموافقة",
    fr: "Signature d'accord",
  },
  signatureAgreementDesc: {
    es: "Para confirmar que estás de acuerdo con estos cambios, firma en el recuadro inferior.",
    ar: "لتأكيد موافقتك على هذه التغييرات، وقّع في المربع أدناه.",
    fr: "Pour confirmer votre accord avec ces modifications, signez dans le cadre ci-dessous.",
  },
  signAndConfirm: {
    es: "Firmar y confirmar",
    ar: "التوقيع والتأكيد",
    fr: "Signer et confirmer",
  },
  reject: {
    es: "Rechazar",
    ar: "رفض",
    fr: "Refuser",
  },
  rejectionReason: {
    es: "Motivo del rechazo",
    ar: "سبب الرفض",
    fr: "Motif du refus",
  },
  rejectionPlaceholder: {
    es: "Indica por qué rechazas esta modificación...",
    ar: "اذكر سبب رفضك لهذا التعديل...",
    fr: "Indiquez pourquoi vous refusez cette modification...",
  },
  confirmRejection: {
    es: "Confirmar rechazo",
    ar: "تأكيد الرفض",
    fr: "Confirmer le refus",
  },
  registeredSignature: {
    es: "Firma registrada",
    ar: "التوقيع المسجل",
    fr: "Signature enregistrée",
  },
  officialDocument: {
    es: "Este es un documento oficial del sistema de gestión de vacaciones de Verdnatura.",
    ar: "هذه وثيقة رسمية من نظام إدارة الإجازات في Verdnatura.",
    fr: "Ceci est un document officiel du système de gestion des congés de Verdnatura.",
  },
  errorLabel: {
    es: "Error",
    ar: "خطأ",
    fr: "Erreur",
  },
  notFound: {
    es: "No encontrado",
    ar: "غير موجود",
    fr: "Non trouvé",
  },
  modificationNotFound: {
    es: "Esta modificación no existe o ha expirado.",
    ar: "هذا التعديل غير موجود أو انتهت صلاحيته.",
    fr: "Cette modification n'existe pas ou a expiré.",
  },
  signHereLabel: {
    es: "Firma aquí",
    ar: "وقّع هنا",
    fr: "Signez ici",
  },
  confirmSignatureHint: {
    es: "Pulsa \"Confirmar firma\" para validar",
    ar: "اضغط على \"تأكيد التوقيع\" للتحقق",
    fr: "Appuyez sur \"Confirmer la signature\" pour valider",
  },
  signatureConfirmedSuccess: {
    es: "Modificación firmada correctamente",
    ar: "تم التوقيع على التعديل بنجاح",
    fr: "Modification signée avec succès",
  },
  signatureRejectedSuccess: {
    es: "Has rechazado la modificación",
    ar: "لقد رفضت التعديل",
    fr: "Vous avez refusé la modification",
  },
  pleaseSign: {
    es: "Por favor, firma en el recuadro antes de confirmar",
    ar: "يرجى التوقيع في المربع قبل التأكيد",
    fr: "Veuillez signer dans le cadre avant de confirmer",
  },
  pleaseIndicateReason: {
    es: "Por favor, indica el motivo del rechazo",
    ar: "يرجى ذكر سبب الرفض",
    fr: "Veuillez indiquer le motif du refus",
  },
  signingError: {
    es: "Error al firmar",
    ar: "خطأ في التوقيع",
    fr: "Erreur lors de la signature",
  },
  rejectingError: {
    es: "Error al rechazar",
    ar: "خطأ في الرفض",
    fr: "Erreur lors du refus",
  },
  workerSignature: {
    es: "Firma del trabajador",
    ar: "توقيع العامل",
    fr: "Signature de l'employé",
  },

  // ===== Apply form (public candidatura) =====
  apply_welcome_title: {
    es: "¡Gracias por tu interés en trabajar con nosotros!",
    ar: "!شكراً لاهتمامك بالعمل معنا",
    fr: "Merci pour votre intérêt à travailler avec nous !",
  },
  apply_start: {
    es: "Empezar",
    ar: "ابدأ",
    fr: "Commencer",
  },
  apply_next: {
    es: "Siguiente",
    ar: "التالي",
    fr: "Suivant",
  },
  apply_back: {
    es: "Atrás",
    ar: "رجوع",
    fr: "Retour",
  },
  apply_step_position: {
    es: "Vacante",
    ar: "الوظيفة",
    fr: "Poste",
  },
  apply_applying_for: {
    es: "Te postulas para:",
    ar: ":تتقدم لوظيفة",
    fr: "Vous postulez pour :",
  },
  apply_no_positions: {
    es: "Actualmente no hay vacantes abiertas. Vuelve pronto.",
    ar: ".لا توجد وظائف شاغرة حالياً. عد قريباً",
    fr: "Aucun poste vacant actuellement. Revenez bientôt.",
  },
  apply_select_position: {
    es: "Selecciona una vacante",
    ar: "اختر وظيفة",
    fr: "Sélectionnez un poste",
  },
  apply_step_personal: {
    es: "Datos personales",
    ar: "البيانات الشخصية",
    fr: "Données personnelles",
  },
  apply_first_name: {
    es: "Nombre",
    ar: "الاسم",
    fr: "Prénom",
  },
  apply_last_name: {
    es: "Apellido",
    ar: "اللقب",
    fr: "Nom de famille",
  },
  apply_gender: {
    es: "Género",
    ar: "الجنس",
    fr: "Genre",
  },
  apply_male: {
    es: "Hombre",
    ar: "رجل",
    fr: "Homme",
  },
  apply_female: {
    es: "Mujer",
    ar: "امرأة",
    fr: "Femme",
  },
  apply_origin_country: {
    es: "País de origen",
    ar: "بلد الأصل",
    fr: "Pays d'origine",
  },
  apply_step_address: {
    es: "¿Dónde vives ahora?",
    ar: "أين تعيش الآن؟",
    fr: "Où habitez-vous actuellement ?",
  },
  apply_search_address: {
    es: "Buscar dirección...",
    ar: "...ابحث عن عنوان",
    fr: "Rechercher une adresse...",
  },
  apply_drag_pin: {
    es: "Arrastra el pin para ajustar tu ubicación",
    ar: "اسحب الدبوس لضبط موقعك",
    fr: "Faites glisser l'épingle pour ajuster votre position",
  },
  apply_step_vehicle: {
    es: "¿Cómo llegas al trabajo?",
    ar: "كيف تصل إلى العمل؟",
    fr: "Comment venez-vous au travail ?",
  },
  apply_vehicle_none: {
    es: "Andando",
    ar: "مشياً",
    fr: "À pied",
  },
  apply_vehicle_skate: {
    es: "Patín",
    ar: "لوح تزلج",
    fr: "Trottinette",
  },
  apply_vehicle_bike: {
    es: "Bicicleta",
    ar: "دراجة",
    fr: "Vélo",
  },
  apply_vehicle_car: {
    es: "Coche",
    ar: "سيارة",
    fr: "Voiture",
  },
  apply_step_spanish: {
    es: "Nivel de español",
    ar: "مستوى الإسبانية",
    fr: "Niveau d'espagnol",
  },
  apply_spanish_1: {
    es: "Básico",
    ar: "أساسي",
    fr: "Basique",
  },
  apply_spanish_2: {
    es: "Elemental",
    ar: "ابتدائي",
    fr: "Élémentaire",
  },
  apply_spanish_3: {
    es: "Intermedio",
    ar: "متوسط",
    fr: "Intermédiaire",
  },
  apply_spanish_4: {
    es: "Avanzado",
    ar: "متقدم",
    fr: "Avancé",
  },
  apply_spanish_5: {
    es: "Nativo",
    ar: "أصلي",
    fr: "Natif",
  },
  apply_spanish_warning: {
    es: "En la entrevista verificaremos tu nivel real de español.",
    ar: ".سنتحقق من مستواك الحقيقي في الإسبانية أثناء المقابلة",
    fr: "Nous vérifierons votre niveau réel d'espagnol lors de l'entretien.",
  },
  apply_step_cv: {
    es: "Sube tu CV",
    ar: "ارفع سيرتك الذاتية",
    fr: "Téléchargez votre CV",
  },
  apply_cv_drop: {
    es: "Arrastra tu CV aquí o pulsa para seleccionar",
    ar: "اسحب سيرتك الذاتية هنا أو اضغط للاختيار",
    fr: "Glissez votre CV ici ou cliquez pour sélectionner",
  },
  apply_cv_camera: {
    es: "Hacer foto al CV",
    ar: "التقاط صورة للسيرة الذاتية",
    fr: "Prendre une photo du CV",
  },
  apply_cv_max_size: {
    es: "Máximo 10MB · PDF o imagen",
    ar: "الحد الأقصى 10 ميجابايت · PDF أو صورة",
    fr: "Maximum 10 Mo · PDF ou image",
  },
  apply_step_confirm: {
    es: "Confirma tus datos",
    ar: "أكد بياناتك",
    fr: "Confirmez vos données",
  },
  apply_submit: {
    es: "Enviar candidatura",
    ar: "إرسال الترشح",
    fr: "Envoyer la candidature",
  },
  apply_submitting: {
    es: "Enviando...",
    ar: "...جاري الإرسال",
    fr: "Envoi en cours...",
  },
  apply_success_title: {
    es: "¡Candidatura enviada!",
    ar: "!تم إرسال الترشح",
    fr: "Candidature envoyée !",
  },
  apply_success_message: {
    es: "Hemos recibido tu candidatura. Te contactaremos si encajas en el puesto.",
    ar: ".لقد استلمنا ترشحك. سنتصل بك إذا كنت مناسباً للوظيفة",
    fr: "Nous avons reçu votre candidature. Nous vous contacterons si vous correspondez au poste.",
  },
  apply_error_required: {
    es: "Este campo es obligatorio",
    ar: "هذا الحقل مطلوب",
    fr: "Ce champ est obligatoire",
  },
  apply_error_duplicate: {
    es: "Ya has enviado una candidatura recientemente. Inténtalo más tarde.",
    ar: ".لقد أرسلت ترشحاً مؤخراً. حاول لاحقاً",
    fr: "Vous avez déjà envoyé une candidature récemment. Réessayez plus tard.",
  },
  apply_error_file_size: {
    es: "El archivo es demasiado grande (máx. 10MB)",
    ar: "(الحد الأقصى 10 ميجابايت) الملف كبير جداً",
    fr: "Le fichier est trop volumineux (max. 10 Mo)",
  },

  // ===== Admin candidaturas =====
  cand_title: {
    es: "Candidaturas",
    ar: "الترشيحات",
    fr: "Candidatures",
  },
  cand_vacantes: {
    es: "Vacantes",
    ar: "الوظائف الشاغرة",
    fr: "Postes vacants",
  },
  cand_new_position: {
    es: "Nueva vacante",
    ar: "وظيفة جديدة",
    fr: "Nouveau poste",
  },
  cand_score: {
    es: "Puntuación IA",
    ar: "نقاط الذكاء الاصطناعي",
    fr: "Score IA",
  },
  cand_distance: {
    es: "Distancia",
    ar: "المسافة",
    fr: "Distance",
  },
  cand_vehicle: {
    es: "Vehículo",
    ar: "وسيلة النقل",
    fr: "Véhicule",
  },
  cand_spanish_level: {
    es: "Nivel ES",
    ar: "مستوى الإسبانية",
    fr: "Niveau ES",
  },
  cand_status: {
    es: "Estado",
    ar: "الحالة",
    fr: "Statut",
  },
  cand_date: {
    es: "Fecha",
    ar: "التاريخ",
    fr: "Date",
  },
  cand_show_rejected: {
    es: "Incluir descartadas por IA",
    ar: "تضمين المرفوضة من الذكاء الاصطناعي",
    fr: "Inclure rejetées par IA",
  },
  cand_show_errors: {
    es: "Solo con errores de IA",
    ar: "فقط مع أخطاء الذكاء الاصطناعي",
    fr: "Seulement avec erreurs IA",
  },
  cand_status_new: {
    es: "Nuevo",
    ar: "جديد",
    fr: "Nouveau",
  },
  cand_status_reviewing: {
    es: "En revisión",
    ar: "قيد المراجعة",
    fr: "En cours de révision",
  },
  cand_status_shortlisted: {
    es: "Preseleccionado",
    ar: "مختار مبدئياً",
    fr: "Présélectionné",
  },
  cand_status_discarded: {
    es: "Descartado",
    ar: "مستبعد",
    fr: "Écarté",
  },
  cand_status_hired: {
    es: "Contratado",
    ar: "تم التوظيف",
    fr: "Embauché",
  },
  cand_ai_passed: {
    es: "Aprobado IA",
    ar: "موافق عليه من الذكاء الاصطناعي",
    fr: "Approuvé IA",
  },
  cand_ai_rejected: {
    es: "Descartado IA",
    ar: "مرفوض من الذكاء الاصطناعي",
    fr: "Rejeté IA",
  },
  cand_ai_pending: {
    es: "Pendiente IA",
    ar: "قيد الانتظار",
    fr: "En attente IA",
  },
  cand_ai_error: {
    es: "Error IA",
    ar: "خطأ في الذكاء الاصطناعي",
    fr: "Erreur IA",
  },
  cand_no_results: {
    es: "No hay candidaturas",
    ar: "لا توجد ترشيحات",
    fr: "Aucune candidature",
  },
  cand_detail: {
    es: "Detalle del candidato",
    ar: "تفاصيل المرشح",
    fr: "Détail du candidat",
  },
  cand_ai_summary: {
    es: "Resumen IA",
    ar: "ملخص الذكاء الاصطناعي",
    fr: "Résumé IA",
  },
  cand_extracted: {
    es: "Datos extraídos",
    ar: "البيانات المستخرجة",
    fr: "Données extraites",
  },
  cand_experience: {
    es: "Experiencia",
    ar: "الخبرة",
    fr: "Expérience",
  },
  cand_education: {
    es: "Formación",
    ar: "التعليم",
    fr: "Formation",
  },
  cand_roles: {
    es: "Puestos anteriores",
    ar: "المناصب السابقة",
    fr: "Postes précédents",
  },
  cand_languages: {
    es: "Idiomas",
    ar: "اللغات",
    fr: "Langues",
  },
  cand_notes: {
    es: "Notas",
    ar: "ملاحظات",
    fr: "Notes",
  },
  cand_download_cv: {
    es: "Descargar CV",
    ar: "تحميل السيرة الذاتية",
    fr: "Télécharger CV",
  },
  cand_criteria: {
    es: "Criterios de filtrado",
    ar: "معايير التصفية",
    fr: "Critères de filtrage",
  },
  cand_max_distance: {
    es: "Distancia máxima",
    ar: "المسافة القصوى",
    fr: "Distance maximale",
  },
  cand_min_spanish: {
    es: "Español mínimo",
    ar: "الحد الأدنى للإسبانية",
    fr: "Espagnol minimum",
  },
  cand_required_kw: {
    es: "Palabras clave requeridas",
    ar: "الكلمات المفتاحية المطلوبة",
    fr: "Mots-clés requis",
  },
  cand_preferred_kw: {
    es: "Palabras clave preferidas",
    ar: "الكلمات المفتاحية المفضلة",
    fr: "Mots-clés préférés",
  },
  cand_custom_prompt: {
    es: "Instrucciones adicionales para la IA",
    ar: "تعليمات إضافية للذكاء الاصطناعي",
    fr: "Instructions supplémentaires pour l'IA",
  },
  cand_custom_prompt_placeholder: {
    es: "Escribe en lenguaje natural cualquier criterio extra que quieras que la IA evalúe. Ej: 'Valoramos experiencia previa en logística de productos perecederos.'",
    ar: "اكتب بلغة طبيعية أي معيار إضافي تريد أن يقيمه الذكاء الاصطناعي",
    fr: "Écrivez en langage naturel tout critère supplémentaire que vous souhaitez que l'IA évalue.",
  },
  cand_export_csv: {
    es: "Exportar CSV",
    ar: "تصدير CSV",
    fr: "Exporter CSV",
  },
  cand_bulk_action: {
    es: "Acción masiva",
    ar: "إجراء جماعي",
    fr: "Action groupée",
  },
  cand_search: {
    es: "Buscar por nombre...",
    ar: "...البحث بالاسم",
    fr: "Rechercher par nom...",
  },
  cand_filters: {
    es: "Filtros",
    ar: "التصفية",
    fr: "Filtres",
  },
  cand_active: {
    es: "Activa",
    ar: "نشط",
    fr: "Active",
  },
  cand_inactive: {
    es: "Inactiva",
    ar: "غير نشط",
    fr: "Inactive",
  },
  cand_years: {
    es: "años",
    ar: "سنوات",
    fr: "ans",
  },
  // Disability
  apply_disability_title: {
    es: "¿Tienes alguna discapacidad reconocida?",
    ar: "هل لديك إعاقة معترف بها؟",
    fr: "Avez-vous un handicap reconnu ?",
  },
  apply_disability_desc: {
    es: "Esta información es confidencial y se utiliza únicamente para adaptar el proceso de selección.",
    ar: "هذه المعلومات سرية وتستخدم فقط لتكييف عملية الاختيار.",
    fr: "Cette information est confidentielle et utilisée uniquement pour adapter le processus de sélection.",
  },
  apply_disability_yes: {
    es: "Sí, tengo discapacidad reconocida",
    ar: "نعم، لدي إعاقة معترف بها",
    fr: "Oui, j'ai un handicap reconnu",
  },
  cand_form_config: {
    es: "Configuración del formulario",
    ar: "إعدادات النموذج",
    fr: "Configuration du formulaire",
  },
  cand_priorities: {
    es: "Prioridades",
    ar: "الأولويات",
    fr: "Priorités",
  },
  cand_no_preference: {
    es: "Sin preferencia",
    ar: "بدون تفضيل",
    fr: "Sans préférence",
  },
  cand_prefer_disability: {
    es: "Priorizar candidatos con discapacidad",
    ar: "إعطاء الأولوية للمرشحين ذوي الإعاقة",
    fr: "Prioriser les candidats handicapés",
  },
  cand_view_form: {
    es: "Ver formulario",
    ar: "عرض النموذج",
    fr: "Voir le formulaire",
  },
  cand_copy_link: {
    es: "Copiar enlace",
    ar: "نسخ الرابط",
    fr: "Copier le lien",
  },
  cand_applications_count: {
    es: "candidaturas",
    ar: "ترشيحات",
    fr: "candidatures",
  },

  // ===== Apply v2 — Founder Class storytelling =====
  apply_v2_intro_title: {
    es: "Hola.\nVamos a conocernos.",
    ar: "مرحبا.\nلنتعرف على بعضنا.",
    fr: "Bonjour.\nFaisons connaissance.",
  },
  apply_v2_intro_subtitle: {
    es: "Solo nos llevará 2 minutos. Elige tu idioma y empezamos.",
    ar: "سيستغرق الأمر دقيقتين فقط. اختر لغتك ولنبدأ.",
    fr: "Cela ne prendra que 2 minutes. Choisissez votre langue et commençons.",
  },
  apply_v2_start: { es: "Empezar", ar: "ابدأ", fr: "Commencer" },
  apply_v2_continue: { es: "Continuar", ar: "متابعة", fr: "Continuer" },

  apply_v2_position_title: { es: "¿Para qué puesto te postulas?", ar: "لأي وظيفة تتقدم؟", fr: "Pour quel poste postulez-vous ?" },
  apply_v2_position_subtitle: { es: "Elige una vacante para continuar.", ar: "اختر وظيفة للمتابعة.", fr: "Choisissez un poste pour continuer." },
  apply_v2_position_other: { es: "Otra", ar: "أخرى", fr: "Autre" },
  apply_v2_position_other_desc: { es: "No veo la vacante que busco", ar: "لا أرى الوظيفة التي أبحث عنها", fr: "Je ne vois pas l'offre que je cherche" },
  apply_v2_position_other_placeholder: { es: "Ej. Conductor, administrativo, jardinero…", ar: "مثال: سائق، إداري، بستاني…", fr: "Ex. Chauffeur, administratif, jardinier…" },
  apply_v2_position_other_hint: { es: "Te avisaremos si abrimos una vacante de este tipo.", ar: "سنخبرك إذا فتحنا وظيفة من هذا النوع.", fr: "Nous vous préviendrons si nous ouvrons un poste de ce type." },
  apply_v2_position_more_options: { es: "Ver otras vacantes", ar: "عرض وظائف أخرى", fr: "Voir d'autres postes" },

  apply_v2_name_title: { es: "Para empezar…\n¿cómo te llamas?", ar: "للبدء…\nما اسمك؟", fr: "Pour commencer…\ncomment vous appelez-vous ?" },
  apply_v2_name_subtitle: { es: "Tu nombre y tu apellido.", ar: "اسمك ولقبك.", fr: "Votre prénom et votre nom." },

  apply_v2_gender_title: { es: "¿Con qué género te identificas?", ar: "بأي جنس تعرّف نفسك؟", fr: "À quel genre vous identifiez-vous ?" },
  apply_v2_gender_subtitle: { es: "Esta información nos ayuda con las estadísticas internas.", ar: "تساعدنا هذه المعلومات في الإحصائيات الداخلية.", fr: "Cette information nous aide pour nos statistiques internes." },

  apply_v2_origin_title: { es: "¿Cuál es tu país de origen?", ar: "ما هو بلدك الأصلي؟", fr: "Quel est votre pays d'origine ?" },
  apply_v2_origin_subtitle: { es: "El país en el que naciste. Selecciónalo de la lista o escríbelo abajo.", ar: "البلد الذي وُلدت فيه. اختره من القائمة أو اكتبه أدناه.", fr: "Le pays où vous êtes né(e). Sélectionnez-le dans la liste ou écrivez-le ci-dessous." },
  apply_v2_origin_other: { es: "Escribe tu país de nacimiento…", ar: "اكتب بلد ميلادك…", fr: "Écrivez votre pays de naissance…" },

  apply_v2_location_title: { es: "¿Dónde vives ahora?", ar: "أين تعيش الآن؟", fr: "Où habitez-vous actuellement ?" },
  apply_v2_location_subtitle: { es: "Lo usaremos para calcular el tiempo hasta el trabajo.", ar: "سنستخدمها لحساب وقت الوصول إلى العمل.", fr: "Nous l'utiliserons pour calculer le temps jusqu'au travail." },

  apply_v2_vehicle_title: { es: "¿Cómo te mueves?", ar: "كيف تتنقل؟", fr: "Comment vous déplacez-vous ?" },
  apply_v2_vehicle_subtitle: { es: "El medio de transporte que usarías para venir a trabajar.", ar: "وسيلة النقل التي ستستخدمها للذهاب إلى العمل.", fr: "Le moyen de transport que vous utiliseriez pour venir travailler." },
  apply_v2_vehicle_none_desc: { es: "Voy andando", ar: "أمشي", fr: "Je marche" },
  apply_v2_vehicle_skate_desc: { es: "Patinete eléctrico", ar: "دراجة كهربائية", fr: "Trottinette électrique" },
  apply_v2_vehicle_bike_desc: { es: "Bicicleta", ar: "دراجة هوائية", fr: "Vélo" },
  apply_v2_vehicle_car_desc: { es: "Coche o moto", ar: "سيارة أو دراجة نارية", fr: "Voiture ou moto" },

  apply_v2_languages_title: { es: "¿Qué idiomas hablas?", ar: "ما اللغات التي تتحدثها؟", fr: "Quelles langues parlez-vous ?" },
  apply_v2_languages_subtitle: { es: "Toca para añadir y elige tu nivel.", ar: "اضغط للإضافة واختر مستواك.", fr: "Appuyez pour ajouter et choisir votre niveau." },

  apply_v2_contact_title: { es: "¿Cómo te contactamos?", ar: "كيف نتواصل معك؟", fr: "Comment vous contacter ?" },
  apply_v2_contact_subtitle: { es: "Email y teléfono activos. Te avisaremos por aquí.", ar: "بريد إلكتروني ورقم هاتف نشطان. سنتواصل معك.", fr: "Email et téléphone actifs. Nous vous contacterons." },
  apply_v2_contact_email_placeholder: { es: "tu@email.com", ar: "your@email.com", fr: "vous@email.com" },
  apply_v2_contact_phone_placeholder: { es: "Teléfono móvil", ar: "رقم الهاتف المحمول", fr: "Téléphone mobile" },
  apply_v2_contact_notice: { es: "Asegúrate de que ambos estén activos. Te llamaremos o escribiremos para la entrevista.", ar: "تأكد من أن كلاهما نشط. سنتصل بك أو نراسلك للمقابلة.", fr: "Assurez-vous que les deux sont actifs. Nous vous contacterons pour l'entretien." },
  apply_v2_lang_basic: { es: "Básico", ar: "أساسي", fr: "Basique" },
  apply_v2_lang_intermediate: { es: "Medio", ar: "متوسط", fr: "Moyen" },
  apply_v2_lang_advanced: { es: "Avanzado", ar: "متقدم", fr: "Avancé" },
  apply_v2_lang_native: { es: "Nativo", ar: "أصلي", fr: "Natif" },
  apply_v2_lang_basic_desc: { es: "Entiendo y digo palabras sueltas.", ar: "أفهم وأقول كلمات مفردة.", fr: "Je comprends et dis des mots isolés." },
  apply_v2_lang_intermediate_desc: { es: "Mantengo conversaciones simples.", ar: "أجري محادثات بسيطة.", fr: "Je tiens des conversations simples." },
  apply_v2_lang_advanced_desc: { es: "Hablo con fluidez sobre cualquier tema.", ar: "أتحدث بطلاقة في أي موضوع.", fr: "Je parle couramment de tout sujet." },
  apply_v2_lang_native_desc: { es: "Es mi lengua materna.", ar: "هي لغتي الأم.", fr: "C'est ma langue maternelle." },
  apply_v2_lang_verify_notice: { es: "Tu nivel se verificará en la entrevista. Sé sincero.", ar: "سيتم التحقق من مستواك في المقابلة. كن صادقاً.", fr: "Votre niveau sera vérifié lors de l'entretien. Soyez honnête." },
  apply_v2_lang_add_other: { es: "Añadir otro idioma", ar: "إضافة لغة أخرى", fr: "Ajouter une autre langue" },
  apply_v2_lang_other_placeholder: { es: "Nombre del idioma", ar: "اسم اللغة", fr: "Nom de la langue" },
  apply_v2_lang_add: { es: "Añadir", ar: "إضافة", fr: "Ajouter" },

  apply_v2_exp_title_generic: { es: "¿Cuántos años de experiencia\ntienes en este sector?", ar: "كم سنة من الخبرة لديك\nفي هذا المجال؟", fr: "Combien d'années d'expérience\navez-vous dans ce secteur ?" },
  apply_v2_exp_title_role: { es: "¿Cuántos años de experiencia\ntienes como {role}?", ar: "كم سنة من الخبرة لديك\nكـ {role}؟", fr: "Combien d'années d'expérience\navez-vous en tant que {role} ?" },
  apply_v2_exp_subtitle: { es: "Aproximado, no hace falta ser exacto.", ar: "تقريبي، لا داعي للدقة.", fr: "Approximatif, pas besoin d'être exact." },
  apply_v2_exp_none: { es: "Ninguna", ar: "لا شيء", fr: "Aucune" },
  apply_v2_exp_lt1: { es: "Menos de 1 año", ar: "أقل من سنة", fr: "Moins d'un an" },
  apply_v2_exp_1to3: { es: "Entre 1 y 3 años", ar: "بين 1 و 3 سنوات", fr: "Entre 1 et 3 ans" },
  apply_v2_exp_gt3: { es: "Más de 3 años", ar: "أكثر من 3 سنوات", fr: "Plus de 3 ans" },

  apply_v2_avail_title: { es: "¿Cuándo podrías empezar?", ar: "متى يمكنك البدء؟", fr: "Quand pourriez-vous commencer ?" },
  apply_v2_avail_title_short: { es: "Disponibilidad", ar: "التوفر", fr: "Disponibilité" },
  apply_v2_avail_subtitle: { es: "Tu disponibilidad para incorporarte.", ar: "توفرك للالتحاق.", fr: "Votre disponibilité pour démarrer." },
  apply_v2_avail_immediate: { es: "Inmediato", ar: "فوراً", fr: "Immédiat" },
  apply_v2_avail_1_2w: { es: "1-2 semanas", ar: "1-2 أسبوع", fr: "1-2 semaines" },
  apply_v2_avail_1m: { es: "1 mes o más", ar: "شهر أو أكثر", fr: "1 mois ou plus" },

  apply_v2_shifts_title: { es: "¿Qué turnos puedes hacer?", ar: "ما المناوبات التي يمكنك العمل بها؟", fr: "Quels horaires pouvez-vous faire ?" },
  apply_v2_shifts_title_short: { es: "Turnos", ar: "المناوبات", fr: "Horaires" },
  apply_v2_shifts_subtitle: { es: "Selecciona todos los que te encajen.", ar: "اختر كل ما يناسبك.", fr: "Sélectionnez tout ce qui vous convient." },
  apply_v2_shift_morning: { es: "Mañana", ar: "صباح", fr: "Matin" },
  apply_v2_shift_afternoon: { es: "Tarde", ar: "ظهيرة", fr: "Après-midi" },
  apply_v2_shift_night: { es: "Noche", ar: "ليل", fr: "Nuit" },
  apply_v2_shift_weekends: { es: "Fines de semana", ar: "عطلات نهاية الأسبوع", fr: "Week-ends" },

  apply_v2_disability_no: { es: "No", ar: "لا", fr: "Non" },

  apply_v2_cv_title: { es: "Por último…\nsube tu CV.", ar: "أخيراً…\nارفع سيرتك الذاتية.", fr: "Pour finir…\ntéléchargez votre CV." },
  apply_v2_cv_subtitle: { es: "Es la pieza más importante. Asegúrate de que se lee bien.", ar: "هذه أهم قطعة. تأكد من وضوحها.", fr: "C'est la pièce la plus importante. Assurez-vous qu'il soit lisible." },

  apply_v2_review_title: { es: "Revisa antes de enviar", ar: "راجع قبل الإرسال", fr: "Vérifiez avant d'envoyer" },
  apply_v2_review_subtitle: { es: "Comprueba que todo es correcto.", ar: "تحقق من صحة كل شيء.", fr: "Vérifiez que tout est correct." },

  apply_v2_legal_title: {
    es: "Protección de datos",
    ar: "حماية البيانات",
    fr: "Protection des données",
  },
  apply_v2_legal_consent: {
    es: "He leído y acepto que VerdNatura S.L. trate mis datos personales con la finalidad de gestionar mi candidatura y procesos de selección, conforme al RGPD (UE) 2016/679 y la LOPDGDD 3/2018.",
    ar: "لقد قرأت وأوافق على معالجة شركة VerdNatura S.L. لبياناتي الشخصية لغرض إدارة طلبي وعمليات الاختيار، وفقًا للائحة العامة لحماية البيانات (الاتحاد الأوروبي) 2016/679 والقانون الأساسي 3/2018.",
    fr: "J'ai lu et j'accepte que VerdNatura S.L. traite mes données personnelles dans le but de gérer ma candidature et les processus de sélection, conformément au RGPD (UE) 2016/679 et à la LOPDGDD 3/2018.",
  },
  apply_v2_legal_details: {
    es: "Responsable: VerdNatura S.L. · Finalidad: gestión de candidaturas y procesos de selección. · Legitimación: consentimiento del interesado y aplicación de medidas precontractuales. · Conservación: hasta 1 año tras la finalización del proceso, o hasta retirada del consentimiento. · Destinatarios: no se cederán datos a terceros salvo obligación legal. · Derechos: acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a rgpd@verdnatura.es. Puede reclamar ante la AEPD (www.aepd.es).",
    ar: "المسؤول: VerdNatura S.L. · الغرض: إدارة الطلبات وعمليات الاختيار. · الأساس القانوني: موافقة المعني وتطبيق التدابير السابقة للتعاقد. · مدة الاحتفاظ: حتى عام واحد بعد انتهاء العملية أو حتى سحب الموافقة. · المستلمون: لن يتم نقل البيانات إلى أطراف ثالثة باستثناء الالتزام القانوني. · الحقوق: الوصول والتصحيح والحذف والاعتراض والتقييد وقابلية النقل عن طريق الكتابة إلى rgpd@verdnatura.es. يمكنك تقديم شكوى إلى AEPD (www.aepd.es).",
    fr: "Responsable: VerdNatura S.L. · Finalité: gestion des candidatures et processus de sélection. · Base légale: consentement de l'intéressé et mise en œuvre de mesures précontractuelles. · Conservation: jusqu'à 1 an après la fin du processus, ou jusqu'au retrait du consentement. · Destinataires: aucune donnée ne sera transférée à des tiers sauf obligation légale. · Droits: accès, rectification, suppression, opposition, limitation et portabilité en écrivant à rgpd@verdnatura.es. Vous pouvez déposer une réclamation auprès de l'AEPD (www.aepd.es).",
  },
  apply_v2_legal_show_more: {
    es: "Ver información completa",
    ar: "عرض المعلومات الكاملة",
    fr: "Voir l'information complète",
  },
  apply_v2_legal_show_less: {
    es: "Ocultar",
    ar: "إخفاء",
    fr: "Masquer",
  },
  apply_v2_legal_required: {
    es: "Debes aceptar el tratamiento de datos para enviar tu candidatura.",
    ar: "يجب الموافقة على معالجة البيانات لإرسال طلبك.",
    fr: "Vous devez accepter le traitement des données pour envoyer votre candidature.",
  },
};

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem("preferred_language");
    if (stored && ["es", "ar", "fr"].includes(stored)) {
      return stored as Language;
    }
    return "es";
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("preferred_language", lang);
  };

  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  const isRTL = language === "ar";

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};

export const languageNames: Record<Language, string> = {
  es: "Español",
  ar: "العربية",
  fr: "Français",
};

export const languageFlags: Record<Language, string> = {
  es: "🇪🇸",
  ar: "🇲🇦",
  fr: "🇸🇳",
};
