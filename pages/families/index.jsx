import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { CalendarCheck, ChevronRight, Plus, Search, Store, Users, X, HandHeart, Phone } from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, ParentBadge, TableSkeleton, Tabs, useDebounced } from "../../components/ui";
import SmartPicker from "../../components/smartPicker";
import ExportButton from "../../components/exportMenu";
import { useFetch } from "../../components/useFetch";
import { api, fmtDate, fmtNumber } from "../../lib/clientApi";

const PAGE_SIZE = 20;

function MemberChips({ members }) {
  const others = members.filter((m) => !m.isRepresentative);
  if (!others.length) return <span className="text-xs text-stone-400">Aucun autre membre</span>;
  const shown = others.slice(0, 3);
  return (
    <span className="flex flex-wrap gap-1.5">
      {shown.map((m) => (
        <span key={m.id} className="max-w-[9rem] truncate rounded-full bg-sand-100 px-2.5 py-1 text-xs font-medium text-stone-700">
          {m.fullName}
        </span>
      ))}
      {others.length > shown.length && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">+{others.length - shown.length}</span>}
    </span>
  );
}

function FamilyRow({ family, beneficiary }) {
  return (
    <li>
      <Link href={`/families/${family.id}`} className="group grid items-center gap-x-6 gap-y-3 px-6 py-4 transition hover:bg-brand-50/60 focus-visible:bg-brand-50 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,2.4fr)_minmax(0,1.6fr)_auto]">
        <span className="flex min-w-0 items-center gap-3.5">
          <Avatar name={family.representativeName} size="lg" />
          <span className="min-w-0">
            <span className="block truncate text-base font-bold text-brand-950">{family.representativeName || "Sans responsable"}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
              <span className="font-mono">{family.representativeCin || "CIN manquant"}</span>
              {family.phone && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Phone className="h-3 w-3" aria-hidden="true" /> {family.phone}
                </span>
              )}
            </span>
          </span>
        </span>
        <span className="min-w-0">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <Users className="h-3.5 w-3.5" aria-hidden="true" /> {fmtNumber(family.membersCount)} personne(s)
          </span>
          <MemberChips members={family.members} />
        </span>
        <span className="min-w-0 space-y-1.5 text-sm">
          <span className="flex items-center gap-2 text-stone-700">
            <HandHeart className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span className="truncate font-medium">{family.sponsorName || "Sans parrain"}</span>
            {family.sponsorParentName && <ParentBadge name={family.sponsorParentName} />}
          </span>
          {beneficiary && (
            <span className="flex items-center gap-2 text-stone-700">
              <Store className="h-4 w-4 shrink-0 text-gold-500" aria-hidden="true" />
              <span className="truncate">{family.benefitVendor || "Vendeur supprimé"}</span>
            </span>
          )}
        </span>
        <span className="flex items-center justify-between gap-3 lg:justify-end">
          {beneficiary ? (
            <Badge tone="green">
              <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" /> {fmtDate(family.benefitDate)}
            </Badge>
          ) : (
            <Badge tone="amber">En attente</Badge>
          )}
          <ChevronRight className="h-5 w-5 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

function FamilyList({ params, beneficiary, page, onPage }) {
  const { data, loading, error, reload } = useFetch("/api/families", { ...params, page, pageSize: PAGE_SIZE });
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <TableSkeleton cols={4} />;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={beneficiary ? "Aucune famille bénéficiaire" : "Aucune famille en attente"}
        description={params.q || params.sponsorId || params.vendorId ? "Aucune famille ne correspond à cette recherche. Essayez une autre orthographe ou retirez un filtre." : beneficiary ? "Les familles apparaissent ici dès qu'elles ont reçu leur panier." : "Enregistrez une famille pour commencer."}
        action={
          beneficiary ? null : (
            <Link href="/families/new">
              <Button icon={Plus}>Nouvelle famille</Button>
            </Link>
          )
        }
      />
    );
  }
  return (
    <>
      <ul className={`divide-y divide-sand-100 transition-opacity ${loading ? "opacity-60" : ""}`}>
        {data.items.map((f) => (
          <FamilyRow key={f.id} family={f} beneficiary={beneficiary} />
        ))}
      </ul>
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={onPage} />
    </>
  );
}

export default function Families() {
  const router = useRouter();
  const [tab, setTab] = useState("waiting");
  const [q, setQ] = useState("");
  const [sponsor, setSponsor] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState("");
  const dq = useDebounced(q, 300);

  useEffect(() => {
    if (!router.isReady) return;
    const id = router.query.sponsorId;
    if (typeof id === "string" && /^\d+$/.test(id)) {
      api(`/api/sponsors/${id}`)
        .then((s) => setSponsor({ id: Number(id), name: s.fullName }))
        .catch(() => {});
    }
  }, [router.isReady, router.query.sponsorId]);

  const beneficiary = tab === "beneficiaries";
  const base = useMemo(() => ({ q: dq, sponsorId: sponsor ? sponsor.id : "" }), [dq, sponsor]);
  const params = useMemo(
    () => ({
      ...base,
      benefited: beneficiary ? "yes" : "no",
      ...(beneficiary ? { vendorId: vendor ? vendor.id : "", benefitFrom: from, benefitTo: to } : {})
    }),
    [base, beneficiary, vendor, from, to]
  );
  useEffect(() => {
    setPage(1);
  }, [params]);

  const waitingCount = useFetch("/api/families", { ...base, benefited: "no", page: 1, pageSize: 1 });
  const doneCount = useFetch("/api/families", { ...base, benefited: "yes", page: 1, pageSize: 1 });
  const hasFilters = Boolean(q || sponsor || vendor || from || to);

  return (
    <>
      <PageHeader
        title="Familles"
        description="Les familles en attente de leur panier et celles qui l'ont déjà reçu sont séparées."
        actions={
          <>
            <ExportButton type="families" params={params} onError={setExportError} />
            <Link href="/families/new">
              <Button icon={Plus}>Nouvelle famille</Button>
            </Link>
          </>
        }
      />
      {exportError && <p className="mb-3 text-sm font-medium text-rose-600">{exportError}</p>}
      <Card className="mb-5 p-5">
        <div className="grid gap-4 md:grid-cols-12">
          <div className="relative md:col-span-5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un nom, un CIN ou un téléphone" className="pl-10" aria-label="Rechercher une famille" autoComplete="off" />
          </div>
          <div className={beneficiary ? "md:col-span-4" : "md:col-span-7"}>
            <SmartPicker kind="sponsor" value={sponsor} onChange={setSponsor} allowCreate={false} placeholder="Tous les parrains" />
          </div>
          {beneficiary && (
            <div className="md:col-span-3">
              <SmartPicker kind="vendor" value={vendor} onChange={setVendor} allowCreate={false} placeholder="Tous les vendeurs" extraParams={{}} />
            </div>
          )}
        </div>
        {beneficiary && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:max-w-md">
            <Field label="Distribué à partir du" htmlFor="from">
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Jusqu'au" htmlFor="to">
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        )}
        {hasFilters && (
          <div className="mt-4">
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              onClick={() => {
                setQ("");
                setSponsor(null);
                setVendor(null);
                setFrom("");
                setTo("");
              }}
            >
              Effacer les filtres
            </Button>
          </div>
        )}
      </Card>
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "waiting", label: "En attente", count: waitingCount.data ? waitingCount.data.total : null },
            { value: "beneficiaries", label: "Déjà bénéficiaires", count: doneCount.data ? doneCount.data.total : null }
          ]}
        />
      </div>
      <Card className="overflow-hidden">
        <FamilyList params={params} beneficiary={beneficiary} page={page} onPage={setPage} />
      </Card>
    </>
  );
}
