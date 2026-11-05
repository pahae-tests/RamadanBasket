import { useEffect, useState } from "react";
import Link from "next/link";
import { HandHeart, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../lib/clientApi";
import { Alert, Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, PageHeader, ParentBadge, Pagination, ProgressBar, Select, Table, TableSkeleton, Tabs, Td, Th, TypeBadge, useDebounced, useToast } from "../../components/ui";
import ExportButton from "../../components/exportMenu";
import EntityEditModal from "../../components/entityEditModal";
import SponsorTree from "../../components/sponsorTree";
import { TYPE_LABELS } from "../../lib/sponsorTypes";
import { NewEntityModal } from "../../components/smartPicker";
import { useFetch } from "../../components/useFetch";

const PAGE_SIZE = 15;

export default function Sponsors() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(q, 300);
  useEffect(() => setPage(1), [debounced]);
  const [view, setView] = useState("list");
  const [type, setType] = useState("");
  useEffect(() => setPage(1), [type]);
  const { data, loading, error, reload } = useFetch("/api/sponsors", { q: debounced, page, pageSize: PAGE_SIZE, type }, { enabled: view === "list" });
  const treeFetch = useFetch("/api/sponsors/tree", {}, { enabled: view === "tree" });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const reloadAll = () => {
    reload();
    treeFetch.reload();
  };

  async function remove() {
    setBusy(true);
    setDeleteError("");
    try {
      await api(`/api/sponsors/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      toast.show("Parrain supprimé.");
      reloadAll();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Parrains"
        description="Un super-parrain gère des parrains, un parrain spécial gère des sous-parrains, et seuls les parrains classiques et les sous-parrains ont des familles. Les totaux d'un parent sont la somme de ses enfants."
        actions={
          <>
            <ExportButton type="sponsors" onError={(m) => toast.show(m, "error")} />
            <Button icon={Plus} onClick={() => setCreating(true)}>
              Nouveau parrain
            </Button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs
          tabs={[
            { value: "list", label: "Liste" },
            { value: "tree", label: "Arborescence" }
          ]}
          value={view}
          onChange={setView}
        />
        {view === "list" && (
          <>
            <div className="relative min-w-[240px] max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un parrain par nom, CIN ou téléphone" className="pl-10" aria-label="Rechercher un parrain" autoComplete="off" />
            </div>
            <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filtrer par type" className="w-auto min-w-[200px]">
              <option value="">Tous les types</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </>
        )}
      </div>
      {view === "tree" ? (
        <Card className="overflow-hidden">
          {treeFetch.error ? (
            <ErrorState message={treeFetch.error} onRetry={treeFetch.reload} />
          ) : !treeFetch.data ? (
            <TableSkeleton cols={3} />
          ) : treeFetch.data.tree.length === 0 ? (
            <EmptyState icon={HandHeart} title="Aucun parrain" description="Ajoutez un parrain pour construire l'arborescence." />
          ) : (
            <SponsorTree tree={treeFetch.data.tree} onEdit={(n) => setEditing({ id: n.id, fullName: n.name, cin: n.cin, phone: n.phone, type: n.type, parentId: n.parentId })} />
          )}
        </Card>
      ) : (
      <Card className="overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={5} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={HandHeart}
            title="Aucun parrain"
            description={debounced ? "Aucun résultat. Essayez une autre orthographe." : "Ajoutez un parrain pour y rattacher des familles."}
            action={!debounced && <Button icon={Plus} onClick={() => setCreating(true)}>Nouveau parrain</Button>}
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Parrain</Th>
                  <Th>CIN</Th>
                  <Th>Téléphone</Th>
                  <Th className="min-w-[200px]">Familles servies</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const rate = s.familiesCount ? (s.benefitedCount / s.familiesCount) * 100 : 0;
                  return (
                    <tr key={s.id} className="transition hover:bg-brand-50/50">
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={s.fullName} />
                          <div className="min-w-0">
                            <p className="truncate font-bold text-brand-950">{s.fullName}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <TypeBadge type={s.type} count={s.subCount} />
                              {s.parentName && <ParentBadge name={s.parentName} />}
                            </div>
                            {s.kind === "approx" && <Badge tone="amber">Correspondance proche</Badge>}
                          </div>
                        </div>
                      </Td>
                      <Td className="font-mono text-xs">{s.cin || <span className="text-stone-400">Non renseigné</span>}</Td>
                      <Td className="tabular-nums">{s.phone || <span className="text-stone-400">Non renseigné</span>}</Td>
                      <Td>
                        <Link href={`/families?sponsorId=${s.id}`} className="block">
                          <div className="mb-1.5 flex justify-between text-xs font-semibold text-stone-600">
                            <span>
                              {s.benefitedCount} sur {s.familiesCount} famille(s){s.canHaveFamilies ? "" : " (total des rattachés)"}
                            </span>
                          </div>
                          <ProgressBar value={rate} />
                        </Link>
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(s)} aria-label={`Modifier ${s.fullName}`} />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              setDeleteError("");
                              setDeleting(s);
                            }}
                            aria-label={`Supprimer ${s.fullName}`}
                          />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      )}

      <NewEntityModal
        kind="sponsor"
        open={creating}
        initialName=""
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          toast.show("Parrain créé.");
          reloadAll();
        }}
      />
      <EntityEditModal
        kind="sponsor"
        entity={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          toast.show("Parrain mis à jour.");
          reloadAll();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={busy}
        title="Supprimer ce parrain ?"
        message={deleting ? `« ${deleting.fullName} » sera supprimé. C'est impossible tant qu'il a des familles ou des sous-parrains.` : ""}
        confirmLabel="Supprimer"
      >
        {deleteError && (
          <Alert tone="error" className="mt-3">
            {deleteError}
          </Alert>
        )}
      </ConfirmDialog>
      {toast.node}
    </>
  );
}
