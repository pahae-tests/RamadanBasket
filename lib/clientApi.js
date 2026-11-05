let csrfToken = "";

export function setCsrf(token) {
  csrfToken = token || "";
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = "GET", body, params, raw = false } = {}) {
  let url = path;
  if (params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && v !== false) search.set(k, v === true ? "1" : String(v));
    });
    const qs = search.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  if (raw) {
    if (!res.ok) {
      let data = {};
      try {
        data = await res.json();
      } catch (error) {
        data = {};
      }
      throw new ApiError(res.status, data.error || "Erreur", data.details);
    }
    return res;
  }
  let data = null;
  try {
    data = await res.json();
  } catch (error) {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || "Une erreur est survenue.", data && data.details);
  return data;
}

export async function downloadFile(path, { method = "GET", body, params, fallbackName = "fichier.xlsx" } = {}) {
  const res = await api(path, { method, body, params, raw: true });
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = match ? match[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "" && v !== false) search.set(k, v === true ? "1" : String(v));
  });
  return search.toString();
}

export const fmtNumber = (n) => (n === null || n === undefined ? "–" : new Intl.NumberFormat("fr-FR").format(n));
export const fmtPercent = (n) => (n === null || n === undefined ? "–" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n)} %`);

export function fmtDate(value) {
  if (!value) return "–";
  const text = String(value);
  const d = new Date(text.length <= 10 ? `${text}T00:00:00Z` : `${text.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return text;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function fmtDateTime(value) {
  if (!value) return "–";
  const d = new Date(`${String(value).replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function fmtBytes(n) {
  if (n === null || n === undefined) return "–";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} Ko`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

export function todayCasablanca() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
