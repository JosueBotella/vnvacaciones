import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Fondo dinámico e interactivo: orbes con gradientes que flotan suavemente
 * y siguen el cursor con un ligero parallax. Pensado para la página de candidatura.
 *
 * - Respeta `prefers-reduced-motion`.
 * - No bloquea clicks (`pointer-events-none`).
 * - Tonos verdes corporativos sobre fondo oscuro, MUY sutiles.
 * - Máscara superior sólida para que el blur nunca se vea cortado en el borde
 *   superior del viewport en móvil.
 */
export function AnimatedBackdrop({ intense = false }: { intense?: boolean }) {
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setMouse({
          x: e.clientX / window.innerWidth,
          y: e.clientY / window.innerHeight,
        });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const px = (mouse.x - 0.5) * (intense ? 60 : 30);
  const py = (mouse.y - 0.5) * (intense ? 60 : 30);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Orbe verde principal — sutil, desplazado hacia abajo para que el blur
          nunca toque el borde superior. */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          width: intense ? 460 : 380,
          height: intense ? 460 : 380,
          background:
            "radial-gradient(circle, hsl(80 100% 42% / 0.18) 0%, hsl(80 100% 42% / 0) 70%)",
          left: "55%",
          top: "35%",
          x: px,
          y: py,
        }}
        animate={
          reduced
            ? undefined
            : { scale: [1, 1.06, 1], opacity: [0.55, 0.85, 0.55] }
        }
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Orbe verde lima secundario — muy sutil */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          width: intense ? 380 : 320,
          height: intense ? 380 : 320,
          background:
            "radial-gradient(circle, hsl(95 80% 55% / 0.14) 0%, hsl(95 80% 55% / 0) 70%)",
          left: "5%",
          top: "62%",
          x: -px,
          y: -py,
        }}
        animate={
          reduced
            ? undefined
            : { scale: [1, 1.1, 1], opacity: [0.4, 0.7, 0.4] }
        }
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
      />

      {/* Orbe verde suave inferior */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          width: intense ? 300 : 240,
          height: intense ? 300 : 240,
          background:
            "radial-gradient(circle, hsl(140 60% 50% / 0.10) 0%, hsl(140 60% 50% / 0) 70%)",
          right: "5%",
          bottom: "8%",
          x: px * 0.5,
          y: py * 0.5,
        }}
        animate={
          reduced
            ? undefined
            : { scale: [1, 1.04, 1], opacity: [0.45, 0.7, 0.45] }
        }
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
      />

      {/* Máscara superior sólida: oculta cualquier orbe contra el borde superior
          del viewport para que NUNCA se vea un corte recto en móvil. */}
      <div
        className="absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "linear-gradient(to bottom, hsl(var(--background)) 0%, hsl(var(--background)) 25%, hsl(var(--background) / 0) 100%)",
        }}
      />
    </div>
  );
}
