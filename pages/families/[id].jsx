import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { CalendarCheck, HandHeart, MapPin, Pencil, Phone, Store, Trash2, Clock, IdCard } from "lucide-react";
import { api, fmtDate } from "../../lib/clientApi";
import FamilyForm from "../../components/familyForm";
import { useFetch } from "../../components/useFetch";
import { Alert, Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, ErrorState, PageHeader, ParentBadge, Skeleton } from "../../components/ui";

function Info({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-stone-500">{label}</p>
        <div className="truncate text-sm font-semibold text-brand-950">{children}</div>
      </div>
    </div>
  );
}

export default function FamilyDetail() {
  const router = useRouter();
  const id = router.query.id;
  const { data, loading, error, reload } = useFetch(`/api/families/${id}`, undefined, { enabled: Boolean(id) });
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const rep = data.members.find((m) => m.isRepresentative);

  async function remove() {
    setBusy(true);
    setDeleteError("");
    try {
      await api(`/api/families/${id}`, { method: "DELETE" });
      router.push("/families");
    } catch (err) {
      setDeleteError(err.message);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <>
        <PageHeader title="Modifier la famille" description={rep ? rep.fullName : ""} breadcrumbs={[{ label: "Familles", href: "/families" }, { label: rep ? rep.fullName : "Famille", href: `/families/${id}` }, { label: "Modification" }]} />
        <FamilyForm
          familyId={Number(id)}
          initial={{
            rep: { fullName: rep ? rep.fullName : "", cin: rep && rep.cin ? rep.cin : "", phone: rep && rep.phone ? rep.phone : "" },
            members: data.members.filter((m) => !m.isRepresentative).map((m) => ({ id: m.id, fullName: m.fullName, cin: m.cin || "", phone: m.phone || "" })),
            sponsor: data.sponsorId ? { id: data.sponsorId, name: data.sponsorName, parentName: data.sponsorParentName || null } : null,
            address: data.address || ""
          }}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={rep ? rep.fullName : "Famille"}
        description={`Famille n° ${data.id}, inscrite le ${fmtDate(data.createdAt)}`}
        breadcrumbs={[{ label: "Familles", href: "/families" }, { label: rep ? rep.fullName : "Famille" }]}
        actions={
          <>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              Modifier
            </Button>
            <Button variant="secondary" icon={Trash2} className="text-rose-600" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </Button>
          </>
        }
      />

      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 p-6 text-white shadow-lift pattern-star sm:p-8">
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Avatar name={rep ? rep.fullName : "?"} size="lg" className="!h-16 !w-16 !text-xl ring-4 ring-white/20" />
            <div>
              <p className="text-xl font-extrabold tracking-tight">{rep ? rep.fullName : "Sans responsable"}</p>
              <p className="mt-1 font-mono text-sm text-brand-100/90">{rep && rep.cin ? rep.cin : "CIN manquant"}</p>
            </div>
          </div>
          {data.benefit ? (
            <div className="rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/15">
              <p className="flex items-center gap-2 text-sm font-semibold text-gold-300">
                <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Panier reçu le {fmtDate(data.benefit.date)}
              </p>
              <p className="mt-1 text-sm text-brand-100/90">Vendeur : {data.benefit.vendorName}</p>
              <Link href={`/distributions/${data.benefit.distributionId}`} className="mt-2 inline-block text-xs font-semibold text-white underline underline-offset-4">
                Voir la distribution
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/15">
              <p className="flex items-center gap-2 text-sm font-semibold text-gold-300">
                <Clock className="h-4 w-4" aria-hidden="true" /> En attente de son panier
              </p>
              <p className="mt-1 text-sm text-brand-100/90">Cette famille n'a pas encore été servie.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Membres de la famille" description={`${data.members.length} personne(s)`} />
          <ul className="grid gap-3 px-6 pb-6 pt-3 sm:grid-cols-2">
            {data.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-sand-50 p-3.5 ring-1 ring-sand-200/70">
                <Avatar name={m.fullName} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-bold text-brand-950">
                    <span className="truncate">{m.fullName}</span>
                    {m.isRepresentative && <Badge tone="green">Responsable</Badge>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-stone-500">
                    <span className="font-mono">{m.cin || "Sans CIN"}</span>
                    <span className="tabular-nums">{m.phone || "Sans téléphone"}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Informations" />
          <div className="space-y-5 px-6 pb-6 pt-3">
            <Info icon={HandHeart} label="Parrain">
              <span className="flex flex-wrap items-center gap-2">
                {data.sponsorName || "Aucun"}
                {data.sponsorParentName && <ParentBadge name={data.sponsorParentName} />}
              </span>
            </Info>
            <Info icon={Phone} label="Téléphone">
              <span className="tabular-nums">{data.phone || "Non renseigné"}</span>
            </Info>
            <Info icon={IdCard} label="CIN du responsable">
              <span className="font-mono">{rep && rep.cin ? rep.cin : "Non renseigné"}</span>
            </Info>
            <Info icon={MapPin} label="Adresse">
              {data.address || "Non renseignée"}
            </Info>
            {data.benefit && (
              <Info icon={Store} label="Vendeur">
                {data.benefit.vendorName}
              </Info>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={busy}
        title="Supprimer cette famille ?"
        message="La famille et ses membres seront supprimés. Son passage dans une distribution reste visible dans l'historique."
        confirmLabel="Supprimer définitivement"
      >
        {deleteError && (
          <Alert tone="error" className="mt-3">
            {deleteError}
          </Alert>
        )}
      </ConfirmDialog>
    </>
  );
}
