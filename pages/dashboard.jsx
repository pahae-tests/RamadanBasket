import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, CalendarDays, HandHeart, PackageCheck, Plus, Store, UserCheck, Users } from "lucide-react";
import { fmtDate, fmtNumber } from "../lib/clientApi";
import { Avatar, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, ParentBadge, ProgressBar, Ring, Skeleton, StatCard } from "../components/ui";
import { useFetch } from "../components/useFetch";
import { useAuth } from "../components/authContext";

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch("/api/dashboard");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <>
        <PageHeader title="Tableau de bord" />
        <Skeleton className="mb-6 h-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </>
    );
  }
  const g = data.global;
  const chart = data.recent.map((d) => ({ date: fmtDate(d.date).slice(0, 5), Familles: d.families }));
  const coverage = g.coverageRate || 0;
  return (
    <>
      <PageHeader
        title={`Bonjour ${user.username}`}
        description="Vue d'ensemble de la distribution des paniers."
        actions={
          <>
            <Link href="/families/new">
              <Button variant="secondary" icon={Plus}>
                Nouvelle famille
              </Button>
            </Link>
            <Link href="/distributions/new">
              <Button icon={PackageCheck}>Nouvelle distribution</Button>
            </Link>
          </>
        }
      />

      <section className="pattern-star relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600 p-6 text-white shadow-lift sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold-400/20 blur-3xl" />
        <div className="relative flex flex-col items-center gap-8 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold uppercase tracking-wider text-gold-300">Progression</p>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {fmtNumber(g.familiesBenefited)} familles servies sur {fmtNumber(g.totalFamilies)}
            </h2>
            <p className="mt-2 max-w-md text-brand-100/80">
              {g.familiesWaiting > 0 ? `Il reste ${fmtNumber(g.familiesWaiting)} famille(s) à servir.` : "Toutes les familles ont reçu leur panier."}
            </p>
            <Link href="/distributions/new" className="mt-5 inline-block">
              <span className="inline-flex items-center gap-2 rounded-full bg-gold-400 px-5 py-2.5 text-sm font-bold text-brand-950 transition hover:bg-gold-300">
                Préparer une distribution <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          </div>
          <Ring value={coverage} label={`${Math.round(coverage)}%`} sublabel="couverture" />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Familles" value={fmtNumber(g.totalFamilies)} hint={`${fmtNumber(g.totalMembers)} membres`} icon={Users} />
        <StatCard label="Parrains" value={fmtNumber(g.totalSponsors)} icon={HandHeart} tone="blue" />
        <StatCard label="Vendeurs actifs" value={fmtNumber(g.activeVendors)} icon={Store} tone="amber" />
        <StatCard label="Paniers distribués" value={fmtNumber(g.basketsDistributed)} hint={`sur ${fmtNumber(g.distributionCount)} distribution(s)`} icon={UserCheck} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Paniers par jour" description="Les 14 derniers jours de distribution" />
          <div className="h-72 p-4">
            {chart.length === 0 ? (
              <EmptyState icon={PackageCheck} title="Aucune distribution" description="Le graphique apparaîtra après la première distribution." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe8" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#78716c" }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#78716c" }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(17,128,99,0.06)" }} />
                  <Bar dataKey="Familles" fill="#16a07c" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Dernières distributions" />
          <ul className="divide-y divide-sand-100">
            {data.latest.length === 0 && <li className="p-5 text-sm text-stone-500">Aucune distribution pour le moment.</li>}
            {data.latest.map((d) => (
              <li key={d.id}>
                <Link href={`/distributions/${d.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-brand-50/60">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <CalendarDays className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 font-semibold text-brand-950">{fmtDate(d.date)}</span>
                  <span className="text-sm font-bold tabular-nums text-stone-600">{d.families} familles</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Parrains avec le plus de familles en attente" />
          <ul className="divide-y divide-sand-100">
            {data.topSponsors.length === 0 && <li className="p-5 text-sm text-stone-500">Aucun parrain.</li>}
            {data.topSponsors.map((s) => (
              <li key={s.id}>
                <Link href={`/families?sponsorId=${s.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-brand-50/60">
                  <Avatar name={s.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold text-brand-950">
                      <span className="truncate">{s.name}</span>
                      {s.parentName && <ParentBadge name={s.parentName} />}
                    </p>
                    <ProgressBar value={s.coverageRate || 0} />
                  </div>
                  <span className="text-sm font-bold tabular-nums text-gold-600">{s.waiting} en attente</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Charge des vendeurs" description="Familles attribuées au total" />
          <ul className="divide-y divide-sand-100">
            {data.vendors.length === 0 && <li className="p-5 text-sm text-stone-500">Aucune attribution pour le moment.</li>}
            {data.vendors.map((v) => (
              <li key={v.name} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={v.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-brand-950">{v.name}</p>
                  <ProgressBar value={v.share || 0} tone="amber" />
                </div>
                <span className="text-sm font-bold tabular-nums text-stone-600">{v.families}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
