import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { HeartHandshake, LogIn, MoonStar, Package, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../components/authContext";
import { Alert, Button, Field, Input } from "../components/ui";

const highlights = [
  { icon: Users, text: "Chaque famille et ses membres, au même endroit" },
  { icon: Package, text: "Un panier par famille, jamais deux fois" },
  { icon: ShieldCheck, text: "Sauvegardes automatiques et accès sécurisé" }
];

export default function Login() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await login(username, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="pattern-star relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 p-14 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gold-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <MoonStar className="h-6 w-6 text-gold-300" aria-hidden="true" />
          </div>
          <span className="text-lg font-bold tracking-tight">Ramadan Basket Manager</span>
        </div>
        <div className="relative">
          <h2 className="max-w-lg text-4xl font-extrabold leading-tight tracking-tight">Chaque panier arrive là où il doit arriver.</h2>
          <p className="mt-4 max-w-md text-lg text-brand-100/80">Familles, parrains, vendeurs et distributions, simplement.</p>
          <ul className="mt-10 space-y-4">
            {highlights.map((h) => (
              <li key={h.text} className="flex items-center gap-3 text-brand-50">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <h.icon className="h-5 w-5 text-gold-300" aria-hidden="true" />
                </span>
                <span className="font-medium">{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-brand-200">
          <HeartHandshake className="h-4 w-4" aria-hidden="true" /> Gestion solidaire des paniers du Ramadan
        </p>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6 rounded-3xl bg-white p-8 shadow-lift ring-1 ring-sand-200" noValidate>
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-800">
              <MoonStar className="h-5 w-5 text-gold-300" aria-hidden="true" />
            </div>
            <span className="font-bold text-brand-950">Ramadan Basket Manager</span>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-brand-950">Connexion</h1>
            <p className="mt-1 text-sm text-stone-500">Entrez votre nom d'utilisateur et votre mot de passe.</p>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Nom d'utilisateur" htmlFor="username">
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </Field>
          <Field label="Mot de passe" htmlFor="password">
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full" size="lg" icon={LogIn} loading={busy} disabled={!username || !password}>
            Se connecter
          </Button>
        </form>
      </div>
    </div>
  );
}
