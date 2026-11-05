import { useState } from "react";
import { Database, DatabaseBackup, Download, FileSpreadsheet, Play } from "lucide-react";
import { api, fmtBytes, fmtDate, fmtDateTime } from "../lib/clientApi";
import { Alert, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, StatusBadge, Table, TableSkeleton, Td, Th, useToast } from "../components/ui";
import { useFetch } from "../components/useFetch";

export default function Backups() {
  const { data, loading, error, reload } = useFetch("/api/backups");
  const [busy, setBusy] = useState("");
  const toast = useToast();

  async function download(run, type) {
    const key = `${run.id}-${type}`;
    setBusy(key);
    try {
      const res = await api("/api/backups/download", { params: { id: run.id, type } });
      window.location.assign(res.url);
    } catch (err) {
      toast.show(err.message, "error");
    } finally {
      setBusy("");
    }
  }

  async function runNow() {
    setBusy("run");
    try {
      const res = await api("/api/backups/run", { method: "POST" });
      if (res.status === "success") toast.show("Sauvegarde terminée avec succès.");
      else if (res.status === "already_completed") toast.show("Une sauvegarde réussie existe déjà pour aujourd'hui.", "info");
      else toast.show(res.message || (res.errors || []).join(" ") || "La sauvegarde est incomplète.", "error");
    } catch (err) {
      toast.show(err.message, "error");
    } finally {
      setBusy("");
      reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Sauvegardes"
        description="Les sauvegardes sont déclenchées une fois par jour par votre tâche planifiée externe. Chaque exécution produit un export SQL complet et un instantané Excel."
        actions={
          <Button icon={Play} onClick={runNow} loading={busy === "run"} disabled={data && !data.storageConfigured}>
            Lancer une sauvegarde maintenant
          </Button>
        }
      />
      {data && !data.storageConfigured && (
        <Alert tone="warning" title="Stockage de sauvegarde non configuré" className="mb-5">
          Variables manquantes sur le serveur : {data.missing.join(", ")}. Aucune sauvegarde ne peut être enregistrée tant qu'elles ne sont pas définies.
        </Alert>
      )}
      <Alert tone="info" className="mb-5" title="Types de sauvegarde">
        <ul className="mt-1 list-disc pl-5">
          <li>
            <strong>SQL complet</strong> (.sql.gz) : schéma, contraintes et données applicatives, restaurable avec le client MySQL.
          </li>
          <li>
            <strong>Instantané Excel</strong> (.xlsx) : lecture et archivage des données métier. Ce n'est pas une sauvegarde complète de la base.
          </li>
          <li>
            <strong>Sauvegardes natives Aiven</strong> : gérées par Aiven, indépendantes de cette page.
          </li>
        </ul>
      </Alert>
      <Card>
        <CardHeader title="Historique des exécutions" description="Les liens de téléchargement sont signés et expirent après 60 secondes." />
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={7} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={DatabaseBackup} title="Aucune sauvegarde" description="La première exécution apparaîtra ici après l'appel de votre tâche planifiée, ou via le bouton « Lancer une sauvegarde maintenant »." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Exécution</Th>
                <Th>Statut</Th>
                <Th>SQL</Th>
                <Th>Excel</Th>
                <Th>Erreur</Th>
                <Th className="text-right">Téléchargements</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="hover:bg-sand-50">
                  <Td className="font-medium">{fmtDate(r.operationalDate)}</Td>
                  <Td>
                    <p>{fmtDateTime(r.startedAt)}</p>
                    <p className="text-xs text-stone-500">{r.completedAt ? `Terminée ${fmtDateTime(r.completedAt)}` : "En cours"}</p>
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.sqlStatus === "pending" ? "running" : r.sqlStatus} />
                      <span className="text-xs text-stone-500">{fmtBytes(r.sqlSize)}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.excelStatus === "pending" ? "running" : r.excelStatus} />
                      <span className="text-xs text-stone-500">{fmtBytes(r.excelSize)}</span>
                    </div>
                  </Td>
                  <Td className="max-w-xs text-xs text-rose-700">{r.error || ""}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" icon={FileSpreadsheet} disabled={!r.hasExcel} loading={busy === `${r.id}-excel`} onClick={() => download(r, "excel")}>
                        Excel
                      </Button>
                      <Button size="sm" variant="secondary" icon={Database} disabled={!r.hasSql} loading={busy === `${r.id}-sql`} onClick={() => download(r, "sql")}>
                        SQL
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {toast.node}
    </>
  );
}
