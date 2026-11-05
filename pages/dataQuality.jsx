import { useState } from "react";
import Link from "next/link";
import { AlertOctagon, CheckCircle2, Copy, Info, RefreshCw } from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader, ErrorState, PageHeader, Skeleton, Table, Td, Th, Tabs } from "../components/ui";
import ExportButton from "../components/exportMenu";
import { useFetch } from "../components/useFetch";

function FamilyLink({ id, name }) {
  return (
    <Link href={`/families/${id}`} className="font-medium text-brand-800 hover:underline">
      {name || `Famille n° ${id}`}
    </Link>
  );
}

function Section({ title, description, tone, count, children, empty }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} description={description} actions={<Badge tone={count > 0 ? tone : "green"}>{count > 0 ? `${count} cas` : "Aucun problème"}</Badge>} />
      {count === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-stone-500">
          <CheckCircle2 className="h-4 w-4 text-brand-600" /> {empty}
        </p>
      ) : (
        children
      )}
    </Card>
  );
}

function PairTable({ rows, hrefBase, reasonKey }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Premier enregistrement</Th>
          <Th>Second enregistrement</Th>
          <Th>Motif</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td>{r.a.familyId ? <FamilyLink id={r.a.familyId} name={r.a.name} /> : r.a.name}</Td>
            <Td>{r.b.familyId ? <FamilyLink id={r.b.familyId} name={r.b.name} /> : r.b.name}</Td>
            <Td>{r.reason || (r.kind === "exact" ? "Noms identiques" : "Noms proches")}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function DataQuality() {
  const { data, loading, error, reload } = useFetch("/api/dataQuality");
  const [tab, setTab] = useState("confirmed");
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const c = data && data.confirmed;
  const p = data && data.potential;
  const w = data && data.warnings;
  const counts = data
    ? {
        confirmed: c.duplicateCins.length + c.familiesWithoutRepresentative.length + c.invalidCin.length + c.invalidPhone.length,
        potential: p.similarFamilies.length + p.duplicatePhones.length + p.similarSponsors.length + p.similarVendors.length,
        warnings: w.missingRepresentativeCin.length + w.missingPhone.length
      }
    : null;

  return (
    <>
      <PageHeader
        title="Qualité des données"
        description="Détection des anomalies, doublons probables et informations manquantes. Aucune fusion ni suppression n'est jamais automatique."
        actions={
          <>
            <ExportButton type="families" params={{ missingPhone: "1" }} label="Exporter les téléphones manquants" />
            <Button variant="secondary" icon={RefreshCw} onClick={reload} loading={loading}>
              Actualiser
            </Button>
          </>
        }
      />
      {!data ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <AlertOctagon className="h-6 w-6 text-rose-600" />
                <div>
                  <p className="text-sm text-stone-500">Violations confirmées</p>
                  <p className="text-2xl font-semibold tabular-nums">{counts.confirmed}</p>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Copy className="h-6 w-6 text-gold-600" />
                <div>
                  <p className="text-sm text-stone-500">Doublons potentiels</p>
                  <p className="text-2xl font-semibold tabular-nums">{counts.potential}</p>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Info className="h-6 w-6 text-sky-700" />
                <div>
                  <p className="text-sm text-stone-500">Avertissements</p>
                  <p className="text-2xl font-semibold tabular-nums">{counts.warnings}</p>
                </div>
              </div>
            </Card>
          </div>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "confirmed", label: `Violations confirmées (${counts.confirmed})` },
              { value: "potential", label: `Doublons potentiels (${counts.potential})` },
              { value: "warnings", label: `Avertissements (${counts.warnings})` }
            ]}
          />
          <div className="mt-6 space-y-6">
            {tab === "confirmed" && (
              <>
                <Alert tone="info">L'unicité du CIN est garantie par la base de données : les doublons confirmés ne peuvent venir que de données restaurées ou importées hors de l'application.</Alert>
                <Section title="CIN en double" tone="red" count={c.duplicateCins.length} empty="Aucun CIN en double.">
                  <Table>
                    <thead>
                      <tr>
                        <Th>CIN</Th>
                        <Th>Enregistrements concernés</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.duplicateCins.map((d) => (
                        <tr key={d.cin}>
                          <Td className="font-mono">{d.cin}</Td>
                          <Td>
                            {d.records.map((r) => (
                              <span key={r.memberId} className="mr-3 inline-block">
                                <FamilyLink id={r.familyId} name={r.name} />
                              </span>
                            ))}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Section>
                <Section title="Familles sans responsable" tone="red" count={c.familiesWithoutRepresentative.length} empty="Toutes les familles ont un responsable.">
                  <ul className="divide-y divide-sand-100">
                    {c.familiesWithoutRepresentative.map((f) => (
                      <li key={f.familyId} className="px-5 py-2.5 text-sm">
                        <FamilyLink id={f.familyId} />
                      </li>
                    ))}
                  </ul>
                </Section>
                <Section title="Formats de CIN invalides" tone="red" count={c.invalidCin.length} empty="Tous les CIN ont un format valide.">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Personne</Th>
                        <Th>Valeur</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.invalidCin.map((r, i) => (
                        <tr key={i}>
                          <Td>
                            <FamilyLink id={r.familyId} name={r.name} />
                          </Td>
                          <Td className="font-mono">{r.value}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Section>
                <Section title="Numéros de téléphone invalides" tone="red" count={c.invalidPhone.length} empty="Tous les numéros ont un format valide.">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Personne</Th>
                        <Th>Valeur</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.invalidPhone.map((r, i) => (
                        <tr key={i}>
                          <Td>
                            <FamilyLink id={r.familyId} name={r.name} />
                          </Td>
                          <Td className="font-mono">{r.value}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Section>
              </>
            )}
            {tab === "potential" && (
              <>
                <Section title="Familles potentiellement en double" description="Responsables aux noms proches partageant le même téléphone, ou aux noms très similaires." tone="amber" count={p.similarFamilies.length} empty="Aucune famille similaire détectée.">
                  <PairTable rows={p.similarFamilies} />
                </Section>
                <Section title="Téléphones partagés entre familles" tone="amber" count={p.duplicatePhones.length} empty="Aucun téléphone partagé.">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Téléphone</Th>
                        <Th>Familles</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.duplicatePhones.map((d) => (
                        <tr key={d.phone}>
                          <Td className="font-mono">{d.phone}</Td>
                          <Td>
                            {d.familyIds.map((id) => (
                              <span key={id} className="mr-3 inline-block">
                                <FamilyLink id={id} />
                              </span>
                            ))}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Section>
                <Section title="Parrains similaires" tone="amber" count={p.similarSponsors.length} empty="Aucun parrain similaire.">
                  <PairTable rows={p.similarSponsors} />
                </Section>
                <Section title="Vendeurs similaires" tone="amber" count={p.similarVendors.length} empty="Aucun vendeur similaire.">
                  <PairTable rows={p.similarVendors} />
                </Section>
              </>
            )}
            {tab === "warnings" && (
              <>
                {[
                  ["CIN du responsable manquant", w.missingRepresentativeCin],
                  ["Téléphone manquant", w.missingPhone]
                ].map(([title, rows]) => (
                  <Section key={title} title={title} tone="blue" count={rows.length} empty="Aucun cas.">
                    <ul className="grid divide-y divide-sand-100 sm:grid-cols-2 sm:divide-y-0">
                      {rows.map((r) => (
                        <li key={r.familyId} className="px-5 py-2 text-sm">
                          <FamilyLink id={r.familyId} name={r.name} />
                        </li>
                      ))}
                    </ul>
                  </Section>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
