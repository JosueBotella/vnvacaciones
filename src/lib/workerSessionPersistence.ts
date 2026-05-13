const REMEMBER_KEY = "vn_remember_session";

export const getRememberSessionPreference = (): boolean => {
  const raw = localStorage.getItem(REMEMBER_KEY);
  // default: remember
  return raw !== "0";
};

export const setRememberSessionPreference = (remember: boolean) => {
  localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
};

export const applySessionPersistencePreference = async (remember: boolean) => {
  setRememberSessionPreference(remember);
  // The Supabase client now uses a custom storage adapter that respects this preference.
  // No manual token migration needed - the adapter handles it automatically.
};

export const bootstrapNonPersistentSession = async () => {
  // No longer needed - the Supabase client storage adapter handles this automatically.
  // Kept for backwards compatibility but does nothing.
};
