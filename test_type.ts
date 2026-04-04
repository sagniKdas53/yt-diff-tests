let token = "";
function apiRequest(options: RequestInit = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(token !== "" ? { "Authorization": "Bearer " + token } : {}),
    ...options.headers,
  };
  return headers;
}
