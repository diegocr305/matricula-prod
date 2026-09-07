// URL base del backend. En desarrollo cae a localhost; en producción
// se define VITE_API_URL en el entorno de build (ej. .env.production).
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://127.0.0.1:8000";
