export function sanitizePhone(raw) {
  const text = String(raw || "");
  const plus = text.trim().startsWith("+");
  const digits = text.replace(/\D/g, "");
  if (plus) return `+${digits.slice(0, 12)}`;
  return digits.slice(0, 10);
}

export function normalizePhoneClient(value) {
  let digits = String(value || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+212")) digits = `0${digits.slice(4)}`;
  else if (/^212\d{9}$/.test(digits)) digits = `0${digits.slice(3)}`;
  return digits;
}

export function phoneError(value) {
  const phone = normalizePhoneClient(value);
  if (!phone) return "";
  if (!/^0[5-7]\d{8}$/.test(phone) || /^0[5-7](\d)\1{7}$/.test(phone)) return "10 chiffres commençant par 05, 06 ou 07.";
  return "";
}

export function sanitizeCin(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

export function cinError(value) {
  const cin = sanitizeCin(value);
  if (!cin) return "";
  return /^[A-Z]{1,2}\d{5,8}$/.test(cin) ? "" : "Format attendu : 1 ou 2 lettres puis 5 à 8 chiffres (ex. AB123456).";
}

export function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  const first = Array.from(parts[0])[0] || "?";
  const second = parts.length > 1 ? Array.from(parts[1])[0] : "";
  return `${first}${second}`.toUpperCase();
}
