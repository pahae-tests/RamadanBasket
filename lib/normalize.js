const ARABIC_KEY = {
  "ب": "b", "ت": "t", "ث": "t", "ج": "j", "ح": "h", "خ": "k", "د": "d", "ذ": "d",
  "ر": "r", "ز": "z", "س": "s", "ش": "s", "ص": "s", "ض": "d", "ط": "t", "ظ": "z",
  "غ": "g", "ف": "f", "ق": "k", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h",
  "پ": "b", "چ": "s", "گ": "g", "ڤ": "f"
};

const ARABIC_VOWELS = new Set(["ا", "و", "ي", "ء", "ع", "ة"]);

function hasArabic(text) {
  return /[؀-ۿ]/.test(text);
}

function normalizeName(value) {
  if (value === null || value === undefined) return "";
  let text = String(value).normalize("NFKD");
  text = text.replace(/[̀-ًͯ-ٰٟـ]/g, "");
  text = text
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ئ|ؤ/g, "ء")
    .replace(/ة/g, "ه");
  text = text.toLowerCase();
  text = text.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return text.replace(/\s+/g, " ").trim();
}

function tokenKey(token) {
  if (hasArabic(token)) {
    let out = "";
    for (const ch of token) {
      if (ARABIC_VOWELS.has(ch)) continue;
      if (ARABIC_KEY[ch]) out += ARABIC_KEY[ch];
      else if (/[a-z]/.test(ch)) out += ch;
    }
    return collapse(out);
  }
  let t = token
    .replace(/3/g, "a")
    .replace(/7/g, "h")
    .replace(/9/g, "q")
    .replace(/5/g, "kh")
    .replace(/2/g, "a")
    .replace(/[0-9]/g, "");
  t = t
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/sh/g, "s")
    .replace(/ch/g, "s")
    .replace(/th/g, "t")
    .replace(/dh/g, "d")
    .replace(/ph/g, "f")
    .replace(/x/g, "ks")
    .replace(/[cq]/g, "k")
    .replace(/[aeiouyw]/g, "");
  return collapse(t);
}

function collapse(text) {
  return text.replace(/(.)\1+/g, "$1");
}

function nameKey(value) {
  const norm = normalizeName(value);
  if (!norm) return "";
  return norm
    .split(" ")
    .map(tokenKey)
    .filter(Boolean)
    .join(" ");
}

function normalizeCin(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).toUpperCase().replace(/[\s\-._/]/g, "");
  return text === "" ? null : text;
}

function isValidCin(cinNorm) {
  return typeof cinNorm === "string" && /^[A-Z]{1,2}[0-9]{5,8}$/.test(cinNorm);
}

function normalizePhone(value) {
  if (value === null || value === undefined) return null;
  let digits = String(value).replace(/[^\d+]/g, "");
  if (digits === "") return null;
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (digits.startsWith("+212")) digits = "0" + digits.slice(4);
  else if (digits.startsWith("212") && digits.length === 12) digits = "0" + digits.slice(3);
  else if (/^[5-7]\d{8}$/.test(digits)) digits = "0" + digits;
  return digits;
}

function isValidPhone(phoneNorm) {
  return typeof phoneNorm === "string" && /^0[5-7]\d{8}$/.test(phoneNorm) && !/^0[5-7](\d)\1{7}$/.test(phoneNorm);
}

function cleanText(value, max) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text === "") return null;
  return max ? text.slice(0, max) : text;
}

function damerauLevenshtein(a, b, maxDistance = 3) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDistance) return maxDistance + 1;
  const rows = [];
  for (let i = 0; i <= la; i++) {
    rows.push(new Array(lb + 1).fill(0));
    rows[i][0] = i;
  }
  for (let j = 0; j <= lb; j++) rows[0][j] = j;
  for (let i = 1; i <= la; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > maxDistance) return maxDistance + 1;
  }
  return rows[la][lb];
}

function allowedDistance(length) {
  if (length >= 7) return 2;
  if (length >= 4) return 1;
  return 0;
}

function allowedKeyDistance(length) {
  if (length >= 8) return 2;
  if (length >= 5) return 1;
  return 0;
}

function tokenSimilarity(q, c) {
  if (q.norm === c.norm) return { value: 1, fuzzy: false };
  if (q.norm.length >= 1 && c.norm.startsWith(q.norm)) return { value: 0.92, fuzzy: false };
  if (q.norm.length >= 3 && c.norm.includes(q.norm)) return { value: 0.6, fuzzy: false };
  let best = 0;
  const crossScript = hasArabic(q.norm) !== hasArabic(c.norm);
  if (q.key && c.key) {
    if (q.key === c.key && (q.key.length >= 2 || crossScript)) best = Math.max(best, 0.88);
    if (q.key.length >= 2 && c.key.startsWith(q.key)) best = Math.max(best, 0.78);
    if (q.key.length >= 2 && c.key.length >= 2) {
      const allowed = allowedKeyDistance(Math.max(q.key.length, c.key.length));
      if (allowed > 0) {
        const d = damerauLevenshtein(q.key, c.key, allowed);
        if (d <= allowed) best = Math.max(best, 0.74 - d * 0.08);
      }
      if (q.key.length >= 4 && c.key.length >= q.key.length) {
        const head = c.key.slice(0, q.key.length);
        if (damerauLevenshtein(q.key, head, 1) <= 1) best = Math.max(best, 0.6);
      }
    }
  }
  if (!hasArabic(q.norm) && !hasArabic(c.norm) && q.norm.length >= 3) {
    const allowed = allowedDistance(Math.max(q.norm.length, c.norm.length));
    if (allowed > 0 || q.norm.length === c.norm.length) {
      const d = damerauLevenshtein(q.norm, c.norm, Math.max(allowed, 1));
      if (d <= Math.max(allowed, 1)) best = Math.max(best, 0.8 - d * 0.08);
      const head = c.norm.slice(0, q.norm.length);
      if (q.norm.length >= 4 && c.norm.length >= q.norm.length && damerauLevenshtein(q.norm, head, 1) <= 1) best = Math.max(best, 0.62);
    }
  }
  return { value: best, fuzzy: best > 0 };
}

function prepareName(value) {
  const norm = normalizeName(value);
  const tokens = norm ? norm.split(" ").map((t) => ({ norm: t, key: tokenKey(t) })) : [];
  return { norm, tokens, joinedKey: tokens.map((t) => t.key).join("") };
}

function mergeVariants(p) {
  const out = [];
  for (let i = 0; i < p.tokens.length - 1; i++) {
    const merged = { norm: p.tokens[i].norm + p.tokens[i + 1].norm, key: collapse(p.tokens[i].key + p.tokens[i + 1].key) };
    const tokens = [...p.tokens.slice(0, i), merged, ...p.tokens.slice(i + 2)];
    out.push({ norm: tokens.map((t) => t.norm).join(" "), tokens, joinedKey: tokens.map((t) => t.key).join("") });
  }
  return out;
}

function scoreCore(query, candidateName) {
  const q = typeof query === "object" && query && query.tokens ? query : prepareName(query);
  const c = typeof candidateName === "object" && candidateName && candidateName.tokens ? candidateName : prepareName(candidateName);
  if (!q.norm || !c.norm) return { score: 0, kind: "none" };
  if (q.norm === c.norm) return { score: 100, kind: "exact" };
  if (c.norm.startsWith(q.norm)) return { score: 92, kind: "partial" };
  const used = new Set();
  let total = 0;
  let fuzzy = false;
  let ok = true;
  for (const qt of q.tokens) {
    let bestIndex = -1;
    let best = 0;
    let bestFuzzy = false;
    c.tokens.forEach((ct, i) => {
      if (used.has(i)) return;
      const r = tokenSimilarity(qt, ct);
      if (r.value > best) {
        best = r.value;
        bestIndex = i;
        bestFuzzy = r.fuzzy;
      }
    });
    if (bestIndex === -1 || best < 0.5) {
      ok = false;
      break;
    }
    used.add(bestIndex);
    total += best;
    if (bestFuzzy) fuzzy = true;
  }
  if (ok) {
    const average = total / q.tokens.length;
    const coverage = q.tokens.length / c.tokens.length;
    const score = Math.round(30 + average * 55 + coverage * 10);
    return { score: Math.min(score, fuzzy ? 89 : 95), kind: fuzzy ? "approx" : "partial" };
  }
  if (q.joinedKey.length >= 3 && c.joinedKey.length >= 3) {
    const allowed = allowedKeyDistance(Math.max(q.joinedKey.length, c.joinedKey.length));
    const d = damerauLevenshtein(q.joinedKey, c.joinedKey, allowed);
    if (d <= allowed) return { score: 62 - d * 6, kind: "approx" };
  }
  return { score: 0, kind: "none" };
}

function scoreName(query, candidateName) {
  const q = typeof query === "object" && query && query.tokens ? query : prepareName(query);
  const c = typeof candidateName === "object" && candidateName && candidateName.tokens ? candidateName : prepareName(candidateName);
  const base = scoreCore(q, c);
  if (base.kind !== "none") return base;
  let best = base;
  const tries = [];
  if (c.tokens.length > 1) for (const v of mergeVariants(c)) tries.push([q, v]);
  if (q.tokens.length > 1) for (const v of mergeVariants(q)) tries.push([v, c]);
  for (const [a, b] of tries) {
    const r = scoreCore(a, b);
    if (r.kind !== "none" && r.score - 4 > best.score) best = { score: r.score - 4, kind: r.kind === "exact" ? "approx" : r.kind };
  }
  return best;
}

function normalizeSearchText(value) {
  return normalizeName(value);
}

module.exports = {
  normalizeName,
  nameKey,
  tokenKey,
  normalizeCin,
  isValidCin,
  normalizePhone,
  isValidPhone,
  cleanText,
  damerauLevenshtein,
  scoreName,
  prepareName,
  normalizeSearchText,
  hasArabic
};
