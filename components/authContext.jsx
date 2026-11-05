import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { api, setCsrf } from "../lib/clientApi";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const data = await api("/api/auth/me");
      setCsrf(data.csrf);
      setUser(data.user);
    } catch (error) {
      setCsrf("");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (username, password) => {
    const data = await api("/api/auth/login", { method: "POST", body: { username, password } });
    setCsrf(data.csrf);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (error) {
      void error;
    }
    setCsrf("");
    setUser(null);
    router.push("/login");
  }, [router]);

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
