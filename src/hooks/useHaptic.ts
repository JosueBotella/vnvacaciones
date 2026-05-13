/**
 * useHaptic — Web Vibration API wrapper
 * Works on Android PWA and iOS 17+ PWA.
 * Fails silently when not supported.
 */
export function useHaptic() {
  const vib = (pattern: number | number[]) => {
    try { navigator.vibrate?.(pattern); } catch { /* noop */ }
  };

  return {
    light:   () => vib(10),
    medium:  () => vib(25),
    heavy:   () => vib(50),
    success: () => vib([10, 50, 10]),
    error:   () => vib([30, 50, 30]),
    threshold: () => vib(8),   // subtle pulse at drag threshold
  };
}
