import { useSearchParams } from "react-router-dom";
import { useCallback } from "react";

/**
 * Syncs a tab value with URL search params or external props (embedded mode).
 * - If externalTab/externalOnChange are provided, uses those (embedded mode).
 * - Otherwise, reads/writes the given paramName from useSearchParams.
 */
export function useTabParam<T extends string>(
  paramName: string,
  defaultValue: T,
  externalTab?: T,
  externalOnChange?: (t: T) => void
): [T, (t: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const currentTab = externalTab ?? (searchParams.get(paramName) as T) ?? defaultValue;

  const setTab = useCallback(
    (newTab: T) => {
      if (externalOnChange) {
        externalOnChange(newTab);
        return;
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newTab === defaultValue) {
            next.delete(paramName);
          } else {
            next.set(paramName, newTab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [externalOnChange, setSearchParams, paramName, defaultValue]
  );

  return [currentTab, setTab];
}
