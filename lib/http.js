const { loadSession } = require("./auth");
const { HttpError, isDuplicateError } = require("./errors");

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch (error) {
    return false;
  }
}

function sendError(res, error) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }
  if (isDuplicateError(error)) {
    res.status(409).json({ error: "Un enregistrement identique existe déjà." });
    return;
  }
  console.error("api_error", error && error.code ? error.code : "unexpected", error && error.message ? String(error.message).slice(0, 200) : "");
  res.status(500).json({ error: "Une erreur interne est survenue." });
}

function route(handlers, options = {}) {
  const { auth = true, admin = false } = options;
  return async function handler(req, res) {
    try {
      const method = req.method;
      const fn = handlers[method];
      if (!fn) {
        res.setHeader("Allow", Object.keys(handlers).join(", "));
        throw new HttpError(405, "Méthode non autorisée.");
      }
      let session = null;
      if (auth) {
        session = await loadSession(req);
        if (!session) throw new HttpError(401, "Authentification requise.");
        if (admin && session.user.role !== "admin") throw new HttpError(403, "Accès réservé aux administrateurs.");
        if (MUTATING.has(method)) {
          if (!checkOrigin(req)) throw new HttpError(403, "Origine non autorisée.");
          const header = req.headers["x-csrf-token"];
          if (!header || header !== session.csrf) throw new HttpError(403, "Jeton CSRF invalide.");
        }
      }
      res.setHeader("Cache-Control", "no-store");
      await fn(req, res, session ? session.user : null, session);
    } catch (error) {
      sendError(res, error);
    }
  };
}

function intParam(value, fallback, min = 1, max = 1000000) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function idParam(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Identifiant invalide.");
  return n;
}

function pageParams(query, defaultSize = 25) {
  const page = intParam(query.page, 1, 1, 100000);
  const pageSize = intParam(query.pageSize, defaultSize, 1, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

module.exports = { route, sendError, clientIp, intParam, idParam, pageParams, checkOrigin };
