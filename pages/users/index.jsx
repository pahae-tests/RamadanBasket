import { useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { api, fmtDateTime } from "../../lib/clientApi";
import { Alert, Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, Select, Table, TableSkeleton, Td, Th, useDebounced, useToast } from "../../components/ui";
import { useFetch } from "../../components/useFetch";
import { useAuth } from "../../components/authContext";

const PAGE_SIZE = 15;
const blank = { username: "", password: "", role: "user", isActive: true };

export default function Users() {
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(q, 300);
  useEffect(() => setPage(1), [debounced]);
  const { data, loading, error, reload } = useFetch("/api/users", { q: debounced, page, pageSize: PAGE_SIZE });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [dialogError, setDialogError] = useState("");
  const toast = useToast();

  function openForm(u) {
    setFormError("");
    setForm(u ? { username: u.username, password: "", role: u.role, isActive: u.isActive } : blank);
    setEditing(u ? { id: u.id } : { id: null });
  }

  async function save(e) {
    if (e) e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError("");
    try {
      if (editing.id) await api(`/api/users/${editing.id}`, { method: "PUT", body: form });
      else await api("/api/users", { method: "POST", body: form });
      setEditing(null);
      toast.show(editing.id ? "Utilisateur mis à jour." : "Utilisateur créé.");
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e) {
    if (e) e.preventDefault();
    if (busy || newPassword.length < 10) return;
    setBusy(true);
    setDialogError("");
    try {
      await api(`/api/users/${resetting.id}`, { method: "POST", body: { password: newPassword } });
      setResetting(null);
      setNewPassword("");
      toast.show("Mot de passe réinitialisé. Les sessions de l'utilisateur ont été fermées.");
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
      await api(`/api/users/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      toast.show("Utilisateur supprimé.");
      reload();
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Gérez les comptes et les rôles. L'identifiant de connexion est le nom de l'utilisateur. Il doit toujours rester un administrateur actif."
        actions={
          <Button icon={Plus} onClick={() => openForm(null)}>
            Nouvel utilisateur
          </Button>
        }
      />
      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un utilisateur" className="pl-10" aria-label="Rechercher un utilisateur" autoComplete="off" />
      </div>
      <Card className="overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={5} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={UserCog} title="Aucun utilisateur" description="Aucun résultat pour cette recherche." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Utilisateur</Th>
                  <Th>Rôle</Th>
                  <Th>Statut</Th>
                  <Th>Dernière connexion</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} className="transition hover:bg-brand-50/50">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.username} />
                        <p className="font-bold text-brand-950">
                          {u.username} {u.id === me.id && <Badge tone="blue">Vous</Badge>}
                        </p>
                      </div>
                    </Td>
                    <Td>
                      {u.role === "admin" ? (
                        <Badge tone="green">
                          <ShieldCheck className="h-3 w-3" /> Administrateur
                        </Badge>
                      ) : (
                        <Badge>Utilisateur</Badge>
                      )}
                    </Td>
                    <Td>{u.isActive ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>}</Td>
                    <Td className="text-sm text-stone-600">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Jamais"}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openForm(u)} aria-label={`Modifier ${u.username}`} />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={KeyRound}
                          onClick={() => {
                            setDialogError("");
                            setNewPassword("");
                            setResetting(u);
                          }}
                          aria-label={`Réinitialiser le mot de passe de ${u.username}`}
                        />
                        {u.id !== me.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              setDialogError("");
                              setDeleting(u);
                            }}
                            aria-label={`Supprimer ${u.username}`}
                          />
                        )}
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

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing && editing.id ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={save} loading={busy}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field label="Nom d'utilisateur" htmlFor="userName" required hint="Sert d'identifiant de connexion. 2 à 60 caractères : lettres, chiffres, espace, point, tiret.">
            <Input id="userName" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
          </Field>
          {!(editing && editing.id) && (
            <Field label="Mot de passe" htmlFor="userPassword" required hint="10 caractères minimum, avec lettres et chiffres.">
              <Input id="userPassword" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            </Field>
          )}
          <Field label="Rôle" htmlFor="userRole">
            <Select id="userRole" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Utilisateur standard</option>
              <option value="admin">Administrateur</option>
            </Select>
          </Field>
          {editing && editing.id && (
            <label className="flex items-center gap-3 rounded-2xl bg-sand-50 px-4 py-3 text-sm font-semibold text-brand-950 ring-1 ring-sand-200">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-sand-300 text-brand-600" />
              Compte actif
            </label>
          )}
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>

      <Modal
        open={Boolean(resetting)}
        onClose={() => setResetting(null)}
        title="Réinitialiser le mot de passe"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetting(null)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={resetPassword} loading={busy} disabled={newPassword.length < 10}>
              Réinitialiser
            </Button>
          </>
        }
      >
        <form onSubmit={resetPassword} className="space-y-4">
          <p className="text-sm text-stone-700">{resetting ? `Nouveau mot de passe pour ${resetting.username}. Ses sessions actives seront fermées.` : ""}</p>
          {dialogError && <Alert tone="error">{dialogError}</Alert>}
          <Field label="Nouveau mot de passe" htmlFor="userNewPass" hint="10 caractères minimum, avec lettres et chiffres.">
            <Input id="userNewPass" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={busy}
        title="Supprimer cet utilisateur ?"
        message={deleting ? `Le compte « ${deleting.username} » sera supprimé définitivement. Désactivez-le plutôt pour conserver l'historique.` : ""}
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
