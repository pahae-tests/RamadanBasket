import { useEffect } from "react";
import { useRouter } from "next/router";
import { Loader2 } from "lucide-react";
import { useAuth } from "../components/authContext";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [user, loading, router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-50">
      <Loader2 className="h-8 w-8 animate-spin text-brand-700" aria-label="Chargement" />
    </div>
  );
}
