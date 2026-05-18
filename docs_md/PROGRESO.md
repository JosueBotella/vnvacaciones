# Progreso del Saneamiento — App VerdNatura HRMS
> Documento para seguimiento y reporte. Actualizado: 2026-05-18

---

## ¿Qué es este proyecto?

La aplicación web interna de VerdNatura para gestión de RRHH: vacaciones, horarios, incidencias laborales, candidaturas, tests psicotécnicos, fichaje y más. Fue construida con una herramienta de generación automática de código (Lovable) y ahora se está saneando para que sea mantenible, estable y lista para producción en servidor propio.

**Escala del sistema:**
- ~150.000 líneas de código frontend
- ~52.000 líneas de lógica de servidor (28 funciones backend)
- 13 módulos de negocio
- 0 tests automatizados al inicio del proyecto

---

## Trabajo completado

### 🔍 Auditoría inicial (semana del 2026-05-18)

**Qué se hizo:** Análisis completo del estado del código antes de tocar nada.

- Se midió el tamaño real del proyecto: 150k líneas de frontend, 52k de backend
- Se identificaron los 10 ficheros más problemáticos (el mayor tiene 6.121 líneas — equivale a un documento Word de ~100 páginas en código)
- Se descubrió que el backend tiene dos ficheros críticos con 17.000 y 13.500 líneas respectivamente que concentran toda la lógica de administración e incidencias
- Se elaboró un plan de refactor estructurado en 4 fases y 13 módulos, con estrategia de dividir el backend en paralelo con el frontend

**Impacto:** Tenemos una radiografía completa del sistema. Sabemos exactamente dónde está la deuda técnica antes de empezar a sanearla.

---

### 🧹 Fase 0 — Limpieza de base (2026-05-18)

Esta fase prepara el terreno para que el resto del trabajo sea seguro y ordenado.

#### ✅ Eliminación de herramientas de desarrollo externas (F0.1)
**Qué se hizo:** Se eliminó la dependencia de Lovable (la herramienta con la que se generó el código originalmente). También se corrigió un error silencioso en la configuración de Vite (el servidor de desarrollo) que dejaba un valor incorrecto en el array de plugins.

**Por qué importa:** El proyecto ya no depende de Lovable para funcionar. Es completamente autónomo. Además se eliminó código que podría causar comportamiento inesperado en el servidor de desarrollo.

#### ✅ Unificación del cliente de base de datos (F0.2)
**Qué se hizo:** Se verificó que toda la aplicación usa un único punto de conexión a la base de datos (Supabase). Se corrigió una inconsistencia en los ficheros de configuración de entorno: el mismo valor de clave estaba guardado con dos nombres diferentes en dos ficheros distintos, lo que podría haber causado que la aplicación fallara silenciosamente en entornos sin el fichero local.

**Por qué importa:** En producción, si se hubiera usado el fichero de entorno incorrecto, la aplicación no habría podido conectarse a la base de datos. El fallo habría sido invisible hasta el momento del despliegue.

#### ✅ Automatización de la generación de tipos (F0.3)
**Qué se hizo:** Se añadió un comando (`npm run types:gen`) que genera automáticamente los "contratos" entre el código y la base de datos. Antes había que ejecutar un comando largo de memoria o no hacerlo.

**Por qué importa:** Cada vez que se modifique la estructura de la base de datos (añadir una tabla, cambiar un campo), se puede regenerar en segundos la definición de tipos para que el código esté siempre sincronizado. Reduce errores humanos.

#### ✅ Activación del análisis de calidad de código (F0.4)
**Qué se hizo:** Se reactivó ESLint (el analizador de calidad de código) con las reglas que estaban desactivadas. El análisis reveló 1.939 avisos en total: 1.634 por uso de tipado débil (`any`), 139 por dependencias incorrectas en hooks de React, y 62 por variables que podían ser constantes. Se ejecutó la corrección automática de los 62 casos mecánicos.

**Por qué importa:** Ahora el proyecto tiene visibilidad real de su deuda técnica. Los 1.634 avisos de tipado débil desaparecerán de forma natural conforme avance el refactor. Los 139 de hooks se revisarán módulo a módulo.

---

#### ✅ Corrección automática de código (F0.4 — lint:fix)
**Qué se hizo:** Se ejecutó la corrección automática del analizador de código. De los 62 casos mecánicos detectados, 54 se corrigieron solos (variables que podían ser constantes pero estaban declaradas como mutables). Los 8 restantes requieren revisión manual y se abordarán módulo a módulo.

**Por qué importa:** El código está más limpio y semánticamente correcto. Además ahora tenemos visibilidad real de la deuda técnica: 87 errores genuinos y ~2.300 avisos progresivos que irán desapareciendo conforme avance el refactor.

#### ✅ Instalación del framework de tests (F0.5)
**Qué se hizo:** Se instaló Vitest (el framework de tests estándar para este tipo de proyectos) junto con las librerías necesarias para testear componentes de interfaz. Se creó la configuración base y se verificó que arranca correctamente.

**Por qué importa:** El proyecto tenía **cero tests**. A partir de ahora, cada módulo que se refactorice irá acompañado de tests que garantizan que el comportamiento no cambia. Es la red de seguridad del refactor.

---

#### ✅ Helpers compartidos para funciones de servidor (F0.6)
**Qué se hizo:** Se creó una carpeta `_shared/` con tres ficheros reutilizables para las 28 funciones de servidor: gestión de CORS (permisos de acceso desde el navegador), helpers de respuesta HTTP (equivalente a Ok/Error/NotFound) y un helper de autenticación (verificación de token).

**Por qué importa:** Antes, cada función de servidor repetía el mismo código de fontanería. Ahora hay un único sitio donde se define ese comportamiento. Si hay un bug o hay que cambiar algo (p.ej. el dominio permitido en CORS para producción), se cambia en un solo fichero y afecta a todas las funciones.

---

## 🎉 Fase 0 completada — Base técnica saneada

La Fase 0 ha dejado el proyecto con una base limpia y preparada para el refactor real:
- Sin dependencias de Lovable
- Cliente de base de datos unificado y correctamente configurado
- Generación automática de tipos de datos
- Analizador de código activo con visibilidad real de la deuda
- Framework de tests instalado y listo
- Código compartido para las funciones de servidor

---

## En progreso

- **Fase 1 — Módulo de autenticación:** Auditar y centralizar el sistema de login (manager y worker) en un contexto compartido accesible desde toda la aplicación.

---

## Próximos pasos

1. Instalar framework de tests (Vitest) — F0.5
2. Scaffolding de helpers compartidos para funciones de servidor — F0.6
3. Refactor del módulo de autenticación (login manager / login worker) — Fase 1
4. Refactor módulo por módulo — Fase 3 (13 módulos en orden de criticidad)

---

## Métricas de deuda técnica

| Métrica | Inicio | Ahora | Objetivo |
|---|---|---|---|
| Avisos ESLint activos | Desconocido (reglas off) | 1.939 | < 50 |
| Ficheros > 1.000 líneas | 30 | 30 | < 5 |
| Tests automatizados | 0 | 0 | > 50 |
| Dependencias externas innecesarias | 1 (lovable-tagger) | 0 | 0 |
| Inconsistencias de configuración | 2 | 0 | 0 |
