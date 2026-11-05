import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Minus, Plus, Scale, Search, Sparkles, Trash2, Users, Wand2 } from "lucide-react";
import { api, fmtNumber } from "../../lib/clientApi";
import { buildPlan, countByVendor } from "../../lib/plan";
import { Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, PageHeader, ParentBadge, Select, cx, useDebounced } from "../../components/ui";
import SmartPicker, { VendorPicker } from "../../components/smartPicker";
import SplitDiagram from "../../components/splitDiagram";
import { useFetch } from "../../components/useFetch";

const STEPS = ["Familles", "Vendeurs", "Confirmation"];

function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function balance(total, list) {
  if (!list.length) return list;
  const base = Math.floor(total / list.length);
  let rest = total - base * list.length;
  return list.map((v) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { ...v, qty: base + extra };
  });
}

function Stepper({ step }) {
  return (
    <ol className="mb-8 flex items-center gap-2 sm:gap-4" aria-label="Étapes">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-3">
            <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition", done ? "bg-brand-600 text-white" : active ? "bg-brand-900 text-white shadow-glow" : "bg-sand-200 text-stone-500")}>
              {done ? <Check className="h-5 w-5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cx("hidden text-sm font-bold sm:block", active ? "text-brand-950" : "text-stone-500")}>{label}</span>
            {i < STEPS.length - 1 && <span className={cx("h-0.5 flex-1 rounded-full", done ? "bg-brand-500" : "bg-sand-200")} />}
          </li>
        );
      })}
    </ol>
  );
}

function PickRow({ family, checked, onToggle }) {
  return (
    <li>
      <button type="button" onClick={() => onToggle(family)} aria-pressed={checked} className={cx("flex w-full items-center gap-4 px-5 py-3.5 text-left transition", checked ? "bg-brand-50" : "hover:bg-sand-50")}>
        <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition", checked ? "border-brand-600 bg-brand-600 text-white" : "border-sand-300 bg-white")}>
          {checked && <Check className="h-4 w-4" aria-hidden="true" />}
        </span>
        <Avatar name={family.representativeName} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-brand-950">{family.representativeName}</span>
          <span className="flex items-center gap-2 text-xs text-stone-500">
            <span className="truncate">
              <span className="font-mono">{family.representativeCin}</span> · {family.sponsorName || "Sans parrain"}
            </span>
            {family.sponsorParentName && <ParentBadge name={family.sponsorParentName} />}
          </span>
        </span>
        <Badge>
          <Users className="h-3 w-3" aria-hidden="true" /> {family.membersCount}
        </Badge>
      </button>
    </li>
  );
}

function FamiliesStep({ selected, setSelected, onNext }) {
  const [q, setQ] = useState("");
  const [sponsor, setSponsor] = useState(null);
  const [limit, setLimit] = useState(30);
  const [count, setCount] = useState("20");
  const [autoMsg, setAutoMsg] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);
  const debounced = useDebounced(q, 300);
  const { data, loading, error, reload } = useFetch("/api/distributions/eligible", { q: debounced, sponsorId: sponsor ? sponsor.id : "", limit });
  const ids = useMemo(() => new Set(selected.map((f) => f.id)), [selected]);

  function toggle(family) {
    setSelected((list) => (list.some((f) => f.id === family.id) ? list.filter((f) => f.id !== family.id) : [...list, family]));
  }

  function selectVisible() {
    setSelected((list) => {
      const have = new Set(list.map((f) => f.id));
      return [...list, ...data.items.filter((f) => !have.has(f.id))];
    });
  }

  async function auto() {
    const n = Number.parseInt(count, 10);
    if (!Number.isInteger(n) || n <= 0) {
      setAutoMsg("Entrez un nombre de familles.");
      return;
    }
    setAutoBusy(true);
    setAutoMsg("");
    try {
      const res = await api("/api/distributions/autoSelect", { method: "POST", body: { count: n, filters: { sponsorId: sponsor ? sponsor.id : undefined }, excludeIds: selected.map((f) => f.id) } });
      setSelected((list) => [...list, ...res.items]);
      setAutoMsg(res.shortfall > 0 ? `${res.selected} famille(s) ajoutée(s). Il n'y en a pas assez : ${res.shortfall} manquante(s).` : `${res.selected} famille(s) ajoutée(s), les plus anciennes inscrites d'abord.`);
    } catch (err) {
      setAutoMsg(err.message);
    } finally {
      setAutoBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="relative z-20 p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="mb-1.5 flex items-center gap-2 text-sm font-bold text-brand-950">
              <Wand2 className="h-4 w-4 text-gold-500" aria-hidden="true" /> Choix automatique
            </p>
            <div className="flex gap-2">
              <Input type="number" min="1" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className="w-28" aria-label="Nombre de familles" />
              <Button variant="subtle" icon={Sparkles} onClick={auto} loading={autoBusy}>
                Ajouter les plus anciennes
              </Button>
            </div>
            {autoMsg && <p className="mt-2 text-sm text-stone-600">{autoMsg}</p>}
          </div>
          <SmartPicker kind="sponsor" label="Filtrer par parrain" id="newDistSponsor" value={sponsor} onChange={setSponsor} allowCreate={false} placeholder="Tous les parrains" extraParams={{}} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-sand-100 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une famille par nom, CIN ou téléphone" className="pl-10" aria-label="Rechercher une famille" autoComplete="off" />
          </div>
          <Button variant="secondary" onClick={selectVisible} disabled={!data || data.items.length === 0}>
            Tout sélectionner
          </Button>
        </div>
        <p className="border-b border-sand-100 bg-sand-50 px-5 py-2.5 text-xs font-semibold text-stone-600">
          Seules les familles qui n'ont pas encore reçu de panier sont affichées{data ? ` : ${fmtNumber(data.total)} disponible(s)` : ""}.
        </p>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <p className="p-8 text-center text-sm text-stone-500">Chargement</p>
        ) : data.items.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Aucune famille disponible" description={debounced || sponsor ? "Aucun résultat avec ces critères." : "Toutes les familles ont déjà reçu leur panier."} />
        ) : (
          <>
            <ul className="divide-y divide-sand-100">
              {data.items.map((f) => (
                <PickRow key={f.id} family={f} checked={ids.has(f.id)} onToggle={toggle} />
              ))}
            </ul>
            {data.total > data.items.length && (
              <div className="border-t border-sand-100 p-4 text-center">
                <Button variant="secondary" onClick={() => setLimit((l) => l + 50)} loading={loading}>
                  Afficher plus ({data.total - data.items.length} restantes)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-brand-950 p-4 text-white shadow-pop">
        <div className="flex items-center gap-3">
          <span className="flex h-11 min-w-[2.75rem] items-center justify-center rounded-2xl bg-white/10 px-3 text-xl font-extrabold tabular-nums">{selected.length}</span>
          <span className="text-sm font-semibold">famille(s) sélectionnée(s)</span>
          {selected.length > 0 && (
            <button type="button" onClick={() => setSelected([])} className="text-xs font-semibold text-brand-200 underline-offset-2 hover:underline">
              Tout effacer
            </button>
          )}
        </div>
        <Button onClick={onNext} disabled={selected.length === 0} className="bg-gold-400 text-brand-950 hover:bg-gold-300">
          Choisir les vendeurs <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function VendorRow({ vendor, max, onQty, onRemove }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <Avatar name={vendor.name} />
      <span className="min-w-0 flex-1 truncate font-bold text-brand-950">{vendor.name}</span>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="sm" icon={Minus} onClick={() => onQty(vendor.id, Math.max(0, vendor.qty - 1))} aria-label={`Moins pour ${vendor.name}`} />
        <Input
          type="text"
          inputMode="numeric"
          value={String(vendor.qty)}
          onChange={(e) => onQty(vendor.id, Math.min(max, Number.parseInt(e.target.value.replace(/\D/g, "") || "0", 10)))}
          className="h-9 w-16 text-center font-bold tabular-nums"
          aria-label={`Nombre de familles pour ${vendor.name}`}
        />
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => onQty(vendor.id, Math.min(max, vendor.qty + 1))} aria-label={`Plus pour ${vendor.name}`} />
      </div>
      <Button variant="ghost" size="sm" icon={Trash2} className="text-rose-600 hover:bg-rose-50" onClick={() => onRemove(vendor.id)} aria-label={`Retirer ${vendor.name}`} />
    </li>
  );
}

function VendorsStep({ total, vendors, setVendors, manual, setManual, onBack, onNext }) {
  const [picked, setPicked] = useState(null);
  const sum = vendors.reduce((s, v) => s + v.qty, 0);
  const remaining = total - sum;

  function add(v) {
    if (!v) return;
    setPicked(null);
    if (vendors.some((x) => x.id === v.id)) return;
    const next = [...vendors, { id: v.id, name: v.name, qty: 0 }];
    setVendors(manual ? next : balance(total, next));
  }

  function remove(id) {
    const next = vendors.filter((v) => v.id !== id);
    setVendors(manual ? next : balance(total, next));
  }

  function setQty(id, qty) {
    setManual(true);
    setVendors(vendors.map((v) => (v.id === id ? { ...v, qty: Math.max(0, qty) } : v)));
  }

  function rebalance() {
    setManual(false);
    setVendors(balance(total, vendors));
  }

  return (
    <div className="space-y-5">
      <Card className="relative z-20 p-5">
        <VendorPicker label="Ajouter un vendeur" id="newDistVendor" value={picked} onChange={add} />
        <p className="mt-2 text-xs text-stone-500">Les familles sont réparties équitablement entre les vendeurs ajoutés. Vous pouvez ajuster chaque quantité.</p>
      </Card>

      {vendors.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="Aucun vendeur choisi" description={`Ajoutez au moins un vendeur pour répartir les ${fmtNumber(total)} familles.`} />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardHeader
              title="Répartition"
              description="Nombre de familles confiées à chaque vendeur"
              actions={
                <Button variant="secondary" size="sm" icon={Scale} onClick={rebalance}>
                  Répartir équitablement
                </Button>
              }
            />
            <ul className="divide-y divide-sand-100">
              {vendors.map((v) => (
                <VendorRow key={v.id} vendor={v} max={total} onQty={setQty} onRemove={remove} />
              ))}
            </ul>
            <div className={cx("flex items-center justify-between px-5 py-3 text-sm font-bold", remaining === 0 ? "bg-brand-50 text-brand-800" : "bg-gold-100 text-gold-600")}>
              <span>{remaining === 0 ? "Toutes les familles sont réparties" : remaining > 0 ? `Il reste ${fmtNumber(remaining)} famille(s) à répartir` : `${fmtNumber(-remaining)} famille(s) en trop`}</span>
              <span className="tabular-nums">
                {fmtNumber(sum)} / {fmtNumber(total)}
              </span>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-1 text-base font-bold text-brand-950">Schéma de la répartition</h2>
            <p className="mb-4 text-sm text-stone-500">Chaque flux représente les familles confiées à un vendeur. Plus il est épais, plus le vendeur en reçoit.</p>
            <SplitDiagram total={total} vendors={vendors} />
          </Card>
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>
          Retour
        </Button>
        <Button onClick={onNext} disabled={vendors.length === 0 || remaining !== 0}>
          Continuer <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function ConfirmStep({ selected, vendors, assignment, setAssignment, date, setDate, onBack, onSubmit, busy, error }) {
  const used = vendors.filter((v) => v.qty > 0 || Object.values(assignment).includes(v.id));
  const counts = countByVendor(selected, assignment);
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-end">
          <Field label="Date de la distribution" htmlFor="distDate" required>
            <Input id="distDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <p className="text-sm text-stone-600">
            <strong className="text-brand-950">{fmtNumber(selected.length)} familles</strong> vont recevoir un panier. Une fois validée, une famille est considérée comme servie et ne pourra plus être sélectionnée.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {used.map((v) => {
          const families = selected.filter((f) => assignment[f.id] === v.id);
          return (
            <Card key={v.id} className="overflow-hidden">
              <div className="flex items-center gap-3 bg-gradient-to-r from-brand-50 to-white px-5 py-4">
                <Avatar name={v.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-brand-950">{v.name}</p>
                  <p className="text-xs text-stone-500">{counts[v.id] || 0} famille(s)</p>
                </div>
              </div>
              <ul className="max-h-72 divide-y divide-sand-100 overflow-y-auto scrollbar-thin">
                {families.length === 0 && <li className="px-5 py-4 text-sm text-stone-500">Aucune famille.</li>}
                {families.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{f.representativeName}</span>
                    <Select value={v.id} onChange={(e) => setAssignment({ ...assignment, [f.id]: Number(e.target.value) })} className="h-9 w-36 py-0 text-xs" aria-label={`Vendeur de ${f.representativeName}`}>
                      {vendors.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" icon={ArrowLeft} onClick={onBack} disabled={busy}>
          Retour
        </Button>
        <Button onClick={onSubmit} loading={busy} icon={CheckCircle2} size="lg">
          Valider la distribution
        </Button>
      </div>
    </div>
  );
}

export default function NewDistribution() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [manual, setManual] = useState(false);
  const [assignment, setAssignment] = useState({});
  const [date, setDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toVendors() {
    setManual(false);
    setVendors((list) => balance(selected.length, list));
    setStep(1);
  }

  function toConfirm() {
    setAssignment(buildPlan(selected, vendors));
    setError("");
    setStep(2);
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await api("/api/distributions", {
        method: "POST",
        body: { date, assignments: selected.map((f) => ({ familyId: f.id, vendorId: assignment[f.id] })) }
      });
      router.push(`/distributions/${res.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Nouvelle distribution"
        description="Trois étapes : choisir les familles, les répartir entre les vendeurs, puis valider."
        breadcrumbs={[{ label: "Distributions", href: "/distributions" }, { label: "Nouvelle" }]}
      />
      <Stepper step={step} />
      {step === 0 && <FamiliesStep selected={selected} setSelected={setSelected} onNext={toVendors} />}
      {step === 1 && <VendorsStep total={selected.length} vendors={vendors} setVendors={setVendors} manual={manual} setManual={setManual} onBack={() => setStep(0)} onNext={toConfirm} />}
      {step === 2 && <ConfirmStep selected={selected} vendors={vendors} assignment={assignment} setAssignment={setAssignment} date={date} setDate={setDate} onBack={() => setStep(1)} onSubmit={submit} busy={busy} error={error} />}
    </>
  );
}
