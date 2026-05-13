export const getManagerSessionToken = (): string | null => {
  return localStorage.getItem("manager_session_token") || sessionStorage.getItem("manager_session_token");
};
