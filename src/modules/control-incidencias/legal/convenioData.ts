/**
 * Control de Incidencias - Legal: Convenio Data
 * 
 * Structured, indexed data extracted from the XVIII Convenio Colectivo Estatal
 * para las Empresas del Comercio de Flores y Plantas (BOE-A-2025-21424).
 * 
 * This file contains the disciplinary regime articles (Capítulo IX, Arts. 49-51)
 * pre-indexed for fast lookup by the legalService.
 */

import type { ArticuloConvenio, FaltaGravedad } from '../core/types';

export const ARTICULOS_DISCIPLINARIOS: ArticuloConvenio[] = [
  // ==========================================
  // ARTÍCULO 49 - Principios de ordenación
  // ==========================================
  {
    numero: '49',
    titulo: 'Régimen disciplinario - Principios de ordenación',
    capitulo: 'IX',
    contenido: `La empresa podrá sancionar las acciones u omisiones punibles en que incurran las personas trabajadoras de acuerdo con la graduación de las faltas y sanciones que se establecen en el Acuerdo de Cobertura de Vacíos. Principios de ordenación:
1. Las presentes normas de régimen disciplinario persiguen el mantenimiento de la disciplina laboral, aspecto fundamental para la normal convivencia, ordenación técnica y organización de la empresa, así como para la garantía y defensa de los derechos e intereses legítimos de las personas trabajadoras y empresarios.
2. Las faltas, siempre que sean constitutivas de un incumplimiento contractual culpable de la persona trabajadora, podrán ser sancionadas por la Dirección de la empresa de acuerdo con la graduación que se establece en el presente capítulo.
3. Toda falta cometida por las personas trabajadoras se clasificará en leve, grave o muy grave.
4. La falta, sea cual fuere su calificación, requerirá comunicación escrita y motivada de la empresa al trabajador o trabajadora.
5. La imposición de sanciones por faltas muy graves será notificada a los representantes legales de las personas trabajadoras, si los hubiere.`,
  },

  // ==========================================
  // ARTÍCULO 50 - Faltas Leves
  // ==========================================
  {
    numero: '50.1.a',
    titulo: 'Impuntualidad leve',
    capitulo: 'IX',
    gravedad: 'leve',
    contenido: 'La impuntualidad no justificada en la entrada o en la salida del trabajo hasta tres ocasiones en un mes por un tiempo total inferior a veinte minutos.',
  },
  {
    numero: '50.1.b',
    titulo: 'Inasistencia leve',
    capitulo: 'IX',
    gravedad: 'leve',
    contenido: 'La inasistencia injustificada al trabajo de un día durante el período de un mes.',
  },
  {
    numero: '50.1.c',
    titulo: 'Falta de comunicación de ausencia',
    capitulo: 'IX',
    gravedad: 'leve',
    contenido: 'La no comunicación con la antelación previa debida de la inasistencia al trabajo por causa justificada, salvo que se acreditase la imposibilidad de la notificación.',
  },
  {
    numero: '50.1.d',
    titulo: 'Abandono breve del puesto',
    capitulo: 'IX',
    gravedad: 'leve',
    contenido: 'El abandono del puesto de trabajo sin causa justificada por breves períodos de tiempo y siempre que ello no hubiere causado riesgo a la integridad de las personas o de las cosas, en cuyo caso podrá ser calificado, según la gravedad, como falta grave o muy grave.',
  },
  {
    numero: '50.1.e',
    titulo: 'Falta de corrección con el público',
    capitulo: 'IX',
    gravedad: 'leve',
    contenido: 'La desatención y falta de corrección en el trato con el público cuando no perjudiquen gravemente la imagen de la empresa.',
  },
  {
    numero: '50.1.f',
    titulo: 'Descuido en conservación de material',
    capitulo: 'IX',
    gravedad: 'leve',
    contenido: 'Los descuidos en la conservación del material que se tuviere a cargo o fuere responsable y que produzcan deterioros leves del mismo.',
  },
  {
    numero: '50.1.g',
    titulo: 'Embriaguez no habitual',
    capitulo: 'IX',
    gravedad: 'leve',
    contenido: 'La embriaguez no habitual en el trabajo.',
  },

  // ==========================================
  // ARTÍCULO 50 - Faltas Graves
  // ==========================================
  {
    numero: '50.2.a',
    titulo: 'Impuntualidad grave',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La impuntualidad no justificada en la entrada o en la salida del trabajo hasta en tres ocasiones en un mes por un tiempo total de hasta sesenta minutos.',
  },
  {
    numero: '50.2.b',
    titulo: 'Inasistencia grave',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La inasistencia injustificada al trabajo de dos a cuatro días durante el período de un mes.',
  },
  {
    numero: '50.2.c',
    titulo: 'Falseamiento de datos de SS',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'El entorpecimiento, la omisión maliciosa y el falseamiento de los datos que tuvieren incidencia en la Seguridad Social.',
  },
  {
    numero: '50.2.d',
    titulo: 'Simulación de enfermedad/accidente',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La simulación de enfermedad o accidente, sin perjuicio de lo previsto en la letra d) del número 3.',
  },
  {
    numero: '50.2.e',
    titulo: 'Suplantación de identidad',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La suplantación de otra persona trabajadora, alterando los registros y controles de entrada y salida al trabajo.',
  },
  {
    numero: '50.2.f',
    titulo: 'Desobediencia a órdenes',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La desobediencia a las órdenes e instrucciones de trabajo, incluidas las relativas a las normas de seguridad e higiene, así como la imprudencia o negligencia en el trabajo, salvo que de ellas derivasen perjuicios graves a la empresa, causaren averías a las instalaciones, maquinarias y, en general, bienes de la empresa o comportasen riesgo de accidente para las personas, en cuyo caso serán consideradas como faltas muy graves.',
  },
  {
    numero: '50.2.g',
    titulo: 'Falta de comunicación de desperfectos',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La falta de comunicación a la empresa de los desperfectos o anormalidades observados en los útiles, herramientas, vehículos y obras a su cargo, cuando de ello se hubiere derivado un perjuicio grave a la empresa.',
  },
  {
    numero: '50.2.h',
    titulo: 'Trabajos particulares en jornada',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La realización sin el oportuno permiso de trabajos particulares durante la jornada, así como el empleo de útiles, herramientas, maquinaria, vehículos y, en general, bienes de la empresa para los que no estuviera autorizado o para usos ajenos a los del trabajo encomendado, incluso fuera de la jornada laboral.',
  },
  {
    numero: '50.2.i',
    titulo: 'Violación de secretos (sin perjuicio grave)',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'El quebrantamiento o la violación de secretos de obligada reserva que no produzca grave perjuicio para la empresa.',
  },
  {
    numero: '50.2.j',
    titulo: 'Embriaguez habitual',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La embriaguez habitual en el trabajo.',
  },
  {
    numero: '50.2.k',
    titulo: 'Falta de aseo personal',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La falta de aseo y limpieza personal cuando pueda afectar al proceso productivo o a la prestación del servicio y siempre que, previamente, hubiere mediado la oportuna advertencia de la empresa.',
  },
  {
    numero: '50.2.l',
    titulo: 'Ejecución deficiente',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La ejecución deficiente de los trabajos encomendados, siempre que de ello no se derivase perjuicio grave para las personas o las cosas.',
  },
  {
    numero: '50.2.m',
    titulo: 'Disminución de rendimiento no repetida',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La disminución del rendimiento normal en el trabajo de manera no repetida.',
  },
  {
    numero: '50.2.n',
    titulo: 'Ofensas graves en el centro',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'Las ofensas de palabra proferidas o de obra cometidas contra las personas, dentro del centro de trabajo, cuando revistan acusada gravedad.',
  },
  {
    numero: '50.2.o',
    titulo: 'Reincidencia en faltas leves',
    capitulo: 'IX',
    gravedad: 'grave',
    contenido: 'La reincidencia en la comisión de cinco faltas leves, aunque sea de distinta naturaleza y siempre que hubiere mediado sanción distinta de la amonestación verbal, dentro de un trimestre.',
  },

  // ==========================================
  // ARTÍCULO 50 - Faltas Muy Graves
  // ==========================================
  {
    numero: '50.3.a',
    titulo: 'Impuntualidad muy grave',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'La impuntualidad no justificada en la entrada o en la salida del trabajo en diez ocasiones durante seis meses o en veinte durante un año debidamente advertida.',
  },
  {
    numero: '50.3.b',
    titulo: 'Inasistencia muy grave',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'La inasistencia injustificada al trabajo durante tres días consecutivos o cinco alternos en un período de un mes.',
  },
  {
    numero: '50.3.c',
    titulo: 'Fraude, deslealtad, hurto',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'El fraude, deslealtad o abuso de confianza en las gestiones encomendadas o la apropiación, hurto o robo de bienes propiedad de la empresa, de compañeros o de cualesquiera otras personas dentro de las dependencias de la empresa.',
  },
  {
    numero: '50.3.d',
    titulo: 'Simulación para pluriempleo',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'La simulación de enfermedad o accidente o la prolongación de la baja por enfermedad o accidente con la finalidad de realizar cualquier trabajo por cuenta propia o ajena.',
  },
  {
    numero: '50.3.e',
    titulo: 'Violación de secretos (con perjuicio grave)',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'El quebrantamiento o violación de secretos de obligada reserva que produzca grave perjuicio para la empresa.',
  },
  {
    numero: '50.3.f',
    titulo: 'Embriaguez/toxicomanía habitual con repercusión',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'La embriaguez habitual o toxicomanía si repercute negativamente en el trabajo.',
  },
  {
    numero: '50.3.g',
    titulo: 'Competencia desleal',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'La realización de actividades que impliquen competencia desleal a la empresa.',
  },
  {
    numero: '50.3.h',
    titulo: 'Disminución voluntaria y continuada de rendimiento',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'La disminución voluntaria y continuada en el rendimiento del trabajo normal o pactado.',
  },
  {
    numero: '50.3.i',
    titulo: 'Inobservancia de servicios de mantenimiento en huelga',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'La inobservancia de los servicios de mantenimiento en caso de huelga.',
  },
  {
    numero: '50.3.j',
    titulo: 'Abuso de autoridad',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'El abuso de autoridad ejercido por quienes desempeñan funciones de mando.',
  },
  {
    numero: '50.3.k',
    titulo: 'No utilización de EPIs',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'La reiterada no utilización de los elementos de protección en materia de seguridad e higiene, debidamente advertida.',
  },
  {
    numero: '50.3.l',
    titulo: 'Derivadas de abandono con riesgo / ejecución deficiente grave',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'Las derivadas de los apartados 1.d) y 2.l) y m) del presente artículo (abandono con riesgo, ejecución deficiente con perjuicio grave, disminución repetida de rendimiento).',
  },
  {
    numero: '50.3.m',
    titulo: 'Reincidencia en faltas graves',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'La reincidencia o reiteración en la comisión de faltas graves, considerando como tal aquella situación en la que, con anterioridad al momento de la comisión del hecho, la persona trabajadora hubiese sido sancionado dos o más veces por faltas graves, aun de distinta naturaleza, durante el período de un año.',
  },
  {
    numero: '50.3.n',
    titulo: 'Acoso moral o sexual',
    capitulo: 'IX',
    gravedad: 'muy_grave',
    contenido: 'El acoso moral o sexual efectuado a los compañeros de trabajo a cualquier persona relacionada con el centro de trabajo. Se considera por acoso toda conducta no deseada que tenga como objetivo o consecuencia atentar contra la dignidad de la persona trabajadora y crear un entorno intimidatorio, humillante y ofensivo.',
  },

  // ==========================================
  // ARTÍCULO 51 - Sanciones
  // ==========================================
  {
    numero: '51',
    titulo: 'Sanciones',
    capitulo: 'IX',
    contenido: `Las sanciones máximas que podrán imponerse por la comisión de las faltas enumeradas en el artículo anterior son las siguientes:
a) Por falta leve: Amonestación verbal o escrita y suspensión de empleo y sueldo de hasta dos días.
b) Por falta grave: Suspensión de empleo y sueldo de tres a catorce días.
c) Por falta muy grave: Suspensión de empleo y sueldo de catorce días a un mes, traslado a centro de trabajo de localidad distinta durante un período de hasta un año y despido disciplinario.

Las anotaciones desfavorables que como consecuencia de las sanciones impuestas pudieran hacerse constar en los expedientes personales quedarán canceladas al cumplirse los plazos de dos, cuatro u ocho meses, según se trate de falta leve, grave o muy grave.`,
  },
];
