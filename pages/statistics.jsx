import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, HandHeart, PackageCheck, Store, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { fmtDate, fmtNumber, fmtPercent } from "../lib/clientApi";
import { Avatar, Card, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, ParentBadge, ProgressBar, Skeleton, StatCard, Table, Td, Th, TypeBadge, useDebounced } from "../components/ui";
import ExportButton from "../components/exportMenu";
import SmartPicker from "../components/smartPicker";
import { useFetch } from "../components/useFetch";

const COLORS = ["#118063", "#e0a12d", "#0369a1", "#9333ea", "#be123c", "#4d7c0f", "#0f766e", "#b45309"];

function ChartCard({ title, description, empty, children, height = 288 }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="p-4" style={{ height }}>
        {empty ? <EmptyState icon={BarChart3} title="Pas de données" description="Aucun enregistrement pour la période sélectionnée." /> : children}
      </div>
    </Card>
  );
}

const axis = { tick: { fontSize: 12, fill: "#78716c" }, tickLine: false, axisLine: false };

function CoverageCell({ rate }) {
  return (
    <Td>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ProgressBar value={rate || 0} />
        </div>
        <span className="w-12 text-right text-xs tabular-nums">{fmtPercent(rate)}</span>
      </div>
    </Td>
  );
}

function SponsorRows({ sponsor: s, depth = 0 }) {
  const indent = { paddingLeft: `${20 + depth * 28}px` };
  if (s.children.length === 0) {
    return (
      <tr>
        <Td style={indent}>
          <span className="flex flex-wrap items-center gap-2 font-semibold">
            {s.name}
            {s.type !== "classic" && <TypeBadge type={s.type} />}
            {s.parentName && <ParentBadge name={s.parentName} />}
          </span>
        </Td>
        <Td className="text-right tabular-nums">{s.families}</Td>
        <Td className="text-right tabular-nums">{s.benefited}</Td>
        <Td className="text-right tabular-nums">{s.waiting}</Td>
        <CoverageCell rate={s.coverageRate} />
      </tr>
    );
  }
  return (
    <>
      <tr className={s.type === "group" ? "bg-gold-100/40" : "bg-sky-50/70"}>
        <Td colSpan={5} style={indent}>
          <span className="flex flex-wrap items-center gap-2 font-bold text-brand-950">
            {s.name}
            <TypeBadge type={s.type} count={s.children.length} />
            {s.parentName && <ParentBadge name={s.parentName} />}
          </span>
        </Td>
      </tr>
      {s.children.map((c) => (
        <SponsorRows key={c.id} sponsor={c} depth={depth + 1} />
      ))}
      <tr className={s.type === "group" ? "border-t-2 border-gold-300 bg-gold-100/60" : "border-t-2 border-sky-300 bg-sky-50"}>
        <Td className="font-bold text-brand-950" style={indent}>
          Total {s.name}
        </Td>
        <Td className="text-right font-bold tabular-nums">{s.families}</Td>
        <Td className="text-right font-bold tabular-nums">{s.benefited}</Td>
        <Td className="text-right font-bold tabular-nums">{s.waiting}</Td>
        <CoverageCell rate={s.coverageRate} />
      </tr>
    </>
  );
}

export default function Statistics() {
  const [filters, setFilters] = useState({ from: "", to: "" });
  const [sponsor, setSponsor] = useState(null);
  const [vendor, setVendor] = useState(null);
  const params = { ...filters, sponsorId: sponsor ? sponsor.id : "", vendorId: vendor ? vendor.id : "" };
  const debounced = useDebounced(params, 300);
  const { data, loading, error, reload } = useFetch("/api/stats", debounced);

  const daily = useMemo(() => (data ? data.daily.map((d) => ({ date: fmtDate(d.date), Familles: d.families, Membres: d.members })) : []), [data]);
  const vendorChart = useMemo(() => (data ? data.vendors.map((v) => ({ name: v.name, Familles: v.families })) : []), [data]);
  const sponsorChart = useMemo(() => (data ? data.sponsors.filter((s) => s.canHaveFamilies && s.families > 0).slice(0, 12).map((s) => ({ name: s.name, Servies: s.benefited, "En attente": s.waiting })) : []), [data]);
  const trend = useMemo(() => {
    if (!data) return { rows: [], vendors: [] };
    const names = [...new Set(data.dailyByVendor.map((r) => r.vendor))];
    const byDate = new Map();
    for (const r of data.dailyByVendor) {
      const key = String(r.date).slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, { date: fmtDate(key) });
      byDate.get(key)[r.vendor] = r.families;
    }
    return { rows: [...byDate.values()], vendors: names };
  }, [data]);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const g = data && data.global;
  const served = g ? [{ name: "Servies", value: g.familiesBenefited }, { name: "En attente", value: g.familiesWaiting }] : [];

  return (
    <>
      <PageHeader title="Statistiques" description="Chiffres calculés à partir des distributions enregistrées." actions={<ExportButton type="statistics" params={debounced} label="Exporter le rapport" />} />
      <Card className="relative z-20 mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Du" htmlFor="statFrom">
          <Input id="statFrom" type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        </Field>
        <Field label="Au" htmlFor="statTo">
          <Input id="statTo" type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        </Field>
        <SmartPicker kind="sponsor" label="Parrain" id="statSponsor" value={sponsor} onChange={setSponsor} allowCreate={false} placeholder="Tous les parrains" extraParams={{}} />
        <SmartPicker kind="vendor" label="Vendeur" id="statVendor" value={vendor} onChange={setVendor} allowCreate={false} placeholder="Tous les vendeurs" extraParams={{}} />
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className={loading ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Familles" value={fmtNumber(g.totalFamilies)} hint={`${fmtNumber(g.totalMembers)} membres`} icon={Users} />
            <StatCard label="Paniers distribués" value={fmtNumber(g.basketsDistributed)} hint={`${fmtNumber(g.membersServed)} personnes servies`} icon={PackageCheck} tone="blue" />
            <StatCard label="Familles servies" value={fmtNumber(g.familiesBenefited)} hint={`Couverture ${fmtPercent(g.coverageRate)}`} icon={UserCheck} />
            <StatCard label="En attente" value={fmtNumber(g.familiesWaiting)} hint="Jamais servies" icon={HandHeart} tone="amber" />
            <StatCard label="Distributions" value={fmtNumber(g.distributionCount)} hint={`${fmtNumber(g.distributionDays)} jour(s)`} icon={BarChart3} tone="blue" />
            <StatCard label="Moyenne par distribution" value={g.averageFamiliesPerDistribution === null ? "–" : fmtNumber(g.averageFamiliesPerDistribution)} hint="familles" icon={PackageCheck} />
            <StatCard label="Moyenne par vendeur" value={g.averageFamiliesPerVendor === null ? "–" : fmtNumber(g.averageFamiliesPerVendor)} hint="familles" icon={Store} tone="amber" />
            <StatCard label="Parrains" value={fmtNumber(g.totalSponsors)} hint={`${fmtNumber(g.activeVendors)} vendeur(s) actif(s)`} icon={HandHeart} tone="blue" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Tendance des distributions" description="Familles servies par jour" empty={daily.length === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe8" vertical={false} />
                  <XAxis dataKey="date" {...axis} />
                  <YAxis allowDecimals={false} {...axis} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Familles" stroke="#118063" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Membres" stroke="#e0a12d" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Comparaison des vendeurs" description="Familles attribuées par vendeur" empty={vendorChart.length === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vendorChart} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe8" vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis allowDecimals={false} {...axis} />
                  <Tooltip />
                  <Bar dataKey="Familles" fill="#16a07c" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Familles servies et en attente" empty={g.totalFamilies === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 24, bottom: 8 }}>
                  <Pie data={served} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label isAnimationActive={false}>
                    <Cell fill="#118063" />
                    <Cell fill="#e0a12d" />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Couverture par parrain" description="Servies et en attente" empty={sponsorChart.length === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sponsorChart} layout="vertical" margin={{ left: 24, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe8" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...axis} />
                  <YAxis type="category" dataKey="name" width={110} {...axis} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Servies" stackId="s" fill="#118063" />
                  <Bar dataKey="En attente" stackId="s" fill="#e0a12d" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Familles par vendeur et par jour" empty={trend.rows.length === 0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend.rows} margin={{ left: -16, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ebe8" vertical={false} />
                <XAxis dataKey="date" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip />
                <Legend />
                {trend.vendors.map((v, i) => (
                  <Bar key={v} dataKey={v} fill={COLORS[i % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card className="overflow-hidden">
            <CardHeader title="Familles et bénéficiaires par parrain" description="Pour un super-parrain ou un parrain spécial : le détail de chaque rattaché, puis le total" />
            {data.sponsorTree.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-stone-500">Aucun parrain.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Parrain</Th>
                    <Th className="text-right">Familles</Th>
                    <Th className="text-right">Ont bénéficié</Th>
                    <Th className="text-right">En attente</Th>
                    <Th className="min-w-[140px]">Couverture</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.sponsorTree.map((s) => (
                    <SponsorRows key={s.id} sponsor={s} />
                  ))}
                  <tr className="bg-brand-900 text-white">
                    <Td className="font-bold text-white">Total général</Td>
                    <Td className="text-right font-bold tabular-nums text-white">{data.sponsorTree.reduce((n, s) => n + s.families, 0)}</Td>
                    <Td className="text-right font-bold tabular-nums text-white">{data.sponsorTree.reduce((n, s) => n + s.benefited, 0)}</Td>
                    <Td className="text-right font-bold tabular-nums text-white">{data.sponsorTree.reduce((n, s) => n + s.waiting, 0)}</Td>
                    <Td />
                  </tr>
                </tbody>
              </Table>
            )}
          </Card>

          <div className="grid gap-6">
            <Card className="overflow-hidden">
              <CardHeader title="Par vendeur" />
              {data.vendors.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-stone-500">Aucune attribution sur la période.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Vendeur</Th>
                      <Th className="text-right">Familles</Th>
                      <Th className="text-right">Membres</Th>
                      <Th className="text-right">Part</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vendors.map((v) => (
                      <tr key={v.id || v.name}>
                        <Td className="font-semibold">{v.name}</Td>
                        <Td className="text-right tabular-nums">{v.families}</Td>
                        <Td className="text-right tabular-nums">{v.members}</Td>
                        <Td className="text-right tabular-nums">{fmtPercent(v.share)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title="Familles qui attendent depuis le plus longtemps" description="Inscrites, jamais servies" />
            {data.waiting.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-stone-500">Toutes les familles ont été servies.</p>
            ) : (
              <ul className="divide-y divide-sand-100">
                {data.waiting.map((f) => (
                  <li key={f.id}>
                    <Link href={`/families/${f.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-brand-50/60">
                      <Avatar name={f.name || "?"} size="sm" />
                      <span className="flex-1 font-semibold text-brand-950">{f.name}</span>
                      <span className="hidden items-center gap-2 text-sm text-stone-500 sm:flex">
                        {f.sponsor}
                        {f.sponsorParent && <ParentBadge name={f.sponsorParent} />}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-stone-600">{f.members} membre(s)</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
