import { useEffect, useState } from "react";
import { Pencil, Plus, Power, Search, Store } from "lucide-react";
import { api, fmtNumber } from "../../lib/clientApi";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, Table, TableSkeleton, Td, Th, useDebounced, useToast } from "../../components/ui";
import ExportButton from "../../components/exportMenu";
import EntityEditModal from "../../components/entityEditModal";
import { NewEntityModal } from "../../components/smartPicker";
import { useFetch } from "../../components/useFetch";

const PAGE_SIZE = 15;

export default function Vendors() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(q, 300);
  useEffect(() => setPage(1), [debounced]);
  const { data, loading, error, reload } = useFetch("/api/vendors", { q: debounced, page, pageSize: PAGE_SIZE });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const toast = useToast();

  async function toggle(v) {
    try {
      await api(`/api/vendors/${v.id}`, { method: "PUT", body: { name: v.name, phone: v.phone || "", isActive: !v.isActive } });
      toast.show(v.isActive ? "Vendeur désactivé." : "Vendeur réactivé.");
      reload();
    } catch (err) {
      toast.show(err.message, "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Vendeurs"
        description="Les vendeurs qui préparent et remettent les paniers. L'historique est conservé même si un vendeur est désactivé."
        actions={
          <>
            <ExportButton type="vendors" onError={(m) => toast.show(m, "error")} />
            <Button icon={Plus} onClick={() => setCreating(true)}>
              Nouveau vendeur
            </Button>
          </>
        }
      />
      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un vendeur par nom ou téléphone" className="pl-10" aria-label="Rechercher un vendeur" autoComplete="off" />
      </div>
      <Card className="overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={4} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Store}
            title="Aucun vendeur"
            description={debounced ? "Aucun résultat. Essayez une autre orthographe." : "Ajoutez un vendeur pour pouvoir lui attribuer des familles."}
            action={!debounced && <Button icon={Plus} onClick={() => setCreating(true)}>Nouveau vendeur</Button>}
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Vendeur</Th>
                  <Th>Téléphone</Th>
                  <Th>Statut</Th>
                  <Th className="text-right">Familles attribuées</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((v) => (
                  <tr key={v.id} className="transition hover:bg-brand-50/50">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={v.name} />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-brand-950">{v.name}</p>
                          {v.kind === "approx" && <Badge tone="amber">Correspondance proche</Badge>}
                        </div>
                      </div>
                    </Td>
                    <Td className="tabular-nums">{v.phone || <span className="text-stone-400">Non renseigné</span>}</Td>
                    <Td>{v.isActive ? <Badge tone="green">Actif</Badge> : <Badge tone="neutral">Inactif</Badge>}</Td>
                    <Td className="text-right font-bold tabular-nums">{v.assigned === undefined ? "" : fmtNumber(v.assigned)}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(v)} aria-label={`Modifier ${v.name}`} />
                        <Button variant="ghost" size="sm" icon={Power} onClick={() => toggle(v)}>
                          {v.isActive ? "Désactiver" : "Réactiver"}
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <NewEntityModal
        kind="vendor"
        open={creating}
        initialName=""
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          toast.show("Vendeur créé.");
          reload();
        }}
      />
      <EntityEditModal
        kind="vendor"
        entity={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          toast.show("Vendeur mis à jour.");
          reload();
        }}
      />
      {toast.node}
    </>
  );
}
