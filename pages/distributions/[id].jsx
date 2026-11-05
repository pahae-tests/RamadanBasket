import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowRightLeft, CalendarDays, Search, Store, Trash2, Users } from "lucide-react";
import { api, fmtDate, fmtNumber } from "../../lib/clientApi";
import { Alert, Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, ParentBadge, ProgressBar, Skeleton, StatCard, useDebounced, useToast, cx } from "../../components/ui";
import { VendorPicker } from "../../components/smartPicker";
import { useFetch } from "../../components/useFetch";
import { useAuth } from "../../components/authContext";

export default function DistributionDetail() {
  const router = useRouter();
  const { user } = useAuth();
  const id = router.query.id;
  const [vendorId, setVendorId] = useState("");
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 300);
  const { data, error, reload } = useFetch(`/api/distributions/${id}`, { vendorId, q: debounced }, { enabled: Boolean(id) });
  const [target, setTarget] = useState(null);
  const [newVendor, setNewVendor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const toast = useToast();

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  async function reassign() {
    if (!newVendor) return;
    setBusy(true);
    setDialogError("");
    try {
      await api(`/api/assignments/${target.id}`, { method: "PATCH", body: { vendorId: newVendor.id } });
      setTarget(null);
      setNewVendor(null);
      toast.show("Vendeur modifié.");
      reload();
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setDialogError("");
    try {
      await api(`/api/distributions/${id}`, { method: "DELETE" });
      router.push("/distributions");
    } catch (err) {
      setDialogError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={`Distribution du ${fmtDate(data.date)}`}
        description="Toutes les familles de cette distribution sont considérées comme servies."
        breadcrumbs={[{ label: "Distributions", href: "/distributions" }, { label: fmtDate(data.date) }]}
        actions={
          user.role === "admin" && (
            <Button variant="secondary" icon={Trash2} className="text-rose-600" onClick={() => { setDialogError(""); setConfirmDelete(true); }}>
              Supprimer
            </Button>
          )
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Familles servies" value={fmtNumber(data.families)} icon={Users} />
        <StatCard label="Personnes" value={fmtNumber(data.members)} icon={Users} tone="blue" />
        <StatCard label="Vendeurs" value={fmtNumber(data.vendors.length)} icon={Store} tone="amber" />
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Par vendeur" description="Cliquez sur un vendeur pour filtrer la liste" />
        <div className="flex flex-wrap gap-3 p-5">
          <button type="button" onClick={() => setVendorId("")} className={cx("rounded-2xl px-4 py-2.5 text-sm font-bold transition", vendorId === "" ? "bg-brand-900 text-white" : "bg-sand-100 text-stone-700 hover:bg-sand-200")}>
            Tous ({data.families})
          </button>
          {data.vendors.map((v) => (
            <button
              key={v.vendorId || v.vendorName}
              type="button"
              onClick={() => setVendorId(v.vendorId ? String(v.vendorId) : "")}
              className={cx("rounded-2xl px-4 py-2.5 text-left text-sm transition", String(v.vendorId) === vendorId ? "bg-brand-900 text-white" : "bg-sand-100 text-stone-700 hover:bg-sand-200")}
            >
              <span className="block font-bold">{v.vendorName}</span>
              <span className="block text-xs opacity-80">{v.families} famille(s)</span>
              <span className="mt-1 block w-28">
                <ProgressBar value={data.families ? (v.families / data.families) * 100 : 0} tone="amber" />
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-sand-100 p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une famille" className="pl-10" aria-label="Rechercher une famille" autoComplete="off" />
          </div>
        </div>
        {data.assignments.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Aucune famille" description="Aucun résultat avec ces critères." />
        ) : (
          <ul className="divide-y divide-sand-100">
            {data.assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <Avatar name={a.familyName} />
                <div className="min-w-0 flex-1">
                  {a.familyId ? (
                    <Link href={`/families/${a.familyId}`} className="block truncate font-bold text-brand-950 hover:underline">
                      {a.familyName}
                    </Link>
                  ) : (
                    <span className="block truncate font-bold text-brand-950">{a.familyName}</span>
                  )}
                  <span className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    <span className="truncate">
                      <span className="font-mono">{a.familyCin}</span> · {a.sponsorName || "Sans parrain"} · {a.membersCount} personne(s)
                    </span>
                    {a.sponsorParentName && <ParentBadge name={a.sponsorParentName} />}
                  </span>
                </div>
                <Badge tone="amber">
                  <Store className="h-3 w-3" aria-hidden="true" /> {a.vendorName}
                </Badge>
                <Button variant="ghost" size="sm" icon={ArrowRightLeft} onClick={() => { setDialogError(""); setNewVendor(null); setTarget(a); }}>
                  Changer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title="Changer de vendeur"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={reassign} loading={busy} disabled={!newVendor}>
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-700">{target ? `Famille ${target.familyName}, actuellement chez ${target.vendorName}.` : ""}</p>
          {dialogError && <Alert tone="error">{dialogError}</Alert>}
          <VendorPicker label="Nouveau vendeur" id="reassignVendor" value={newVendor} onChange={setNewVendor} />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={busy}
        title="Supprimer cette distribution ?"
        message="Les familles concernées redeviendront disponibles pour une nouvelle distribution."
        confirmLabel="Supprimer"
      >
        {dialogError && (
          <Alert tone="error" className="mt-3">
            {dialogError}
          </Alert>
        )}
      </ConfirmDialog>
      {toast.node}
    </>
  );
}
