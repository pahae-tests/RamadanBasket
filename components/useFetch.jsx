import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/clientApi";

export function useFetch(path, params, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const ticket = useRef(0);
  const key = JSON.stringify([path, params]);

  const load = useCallback(async () => {
    if (!enabled) return;
    const [p, q] = JSON.parse(key);
    const t = ++ticket.current;
    setLoading(true);
    setError("");
    try {
      const result = await api(p, { params: q });
      if (t === ticket.current) setData(result);
    } catch (err) {
      if (t === ticket.current) setError(err.message);
    } finally {
      if (t === ticket.current) setLoading(false);
    }
  }, [key, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
