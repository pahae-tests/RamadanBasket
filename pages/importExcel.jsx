import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Trash2, Upload, Wand2 } from "lucide-react";
import { api, downloadFile, fmtNumber } from "../lib/clientApi";
import { Alert, Badge, Button, Card, CardHeader, ConfirmDialog, Field, Input, PageHeader, Select, Table, Td, Th, Tabs, cx } from "../components/ui";

const STEPS = ["Fichier", "Colonnes", "Validation", "Import"];

function Stepper({ step }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-3 text-sm" aria-label="Étapes de l'import">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span className={cx("flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold", i < step ? "bg-brand-700 text-white" : i === step ? "bg-brand-100 text-brand-800 ring-2 ring-brand-600" : "bg-sand-200 text-stone-500")}>{i + 1}</span>
          <span className={i === step ? "font-semibold text-brand-950" : "text-stone-500"}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

function ImportTab() {
  const [step, setStep] = useState(0);
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState(null);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [mode, setMode] = useState("add");
  const [validation, setValidation] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef(null);

  const fieldByLabel = useMemo(() => {
    const map = {};
    if (parsed) parsed.fields.forEach((f) => (map[f.label] = f.key));
    return map;
  }, [parsed]);

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError("");
    if (!/\.xlsx$/i.test(file.name)) {
      setError("Seuls les fichiers .xlsx sont acceptés.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Fichier trop volumineux (3 Mo maximum).");
      return;
    }
    setBusy("parse");
    try {
      const contentBase64 = await readBase64(file);
      const data = await api("/api/admin/import/parse", { method: "POST", body: { filename: file.name, contentBase64 } });
      setFilename(file.name);
      setParsed(data);
      setRows(data.rows);
      setMapping(data.mapping);
      setValidation(null);
      setResult(null);
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function validate(nextRows = rows) {
    setBusy("validate");
    setError("");
    try {
      const data = await api("/api/admin/import/validate", { method: "POST", body: { rows: nextRows, mapping, mode } });
      setValidation(data);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function setCell(rowNumber, column, value) {
    const index = mapping[fieldByLabel[column]];
    if (index === null || index === undefined) return;
    setRows((list) => list.map((r) => (r.n === rowNumber ? { ...r, v: r.v.map((c, i) => (i === index ? value : c)) } : r)));
  }

  function cellValue(rowNumber, column) {
    const index = mapping[fieldByLabel[column]];
    const row = rows.find((r) => r.n === rowNumber);
    if (!row || index === null || index === undefined) return "";
    return row.v[index];
  }

  async function report() {
    try {
      await downloadFile("/api/admin/import/errorReport", { method: "POST", body: { errors: validation.errors, warnings: validation.warnings }, fallbackName: "rapportErreursImport.xlsx" });
    } catch (err) {
      setError(err.message);
    }
  }

  async function commit() {
    setBusy("commit");
    setError("");
    try {
      const data = await api("/api/admin/import/commit", { method: "POST", body: { rows, mapping, mode, filename, confirmation } });
      setResult(data);
      setConfirmOpen(false);
      setStep(3);
    } catch (err) {
      setError(err.message);
      setConfirmOpen(false);
      if (err.status === 422) validate();
    } finally {
      setBusy("");
    }
  }

  function restart() {
    setStep(0);
    setParsed(null);
    setRows([]);
    setValidation(null);
    setResult(null);
    setConfirmation("");
    setError("");
  }

  const errorRows = useMemo(() => {
    if (!validation) return [];
    const grouped = new Map();
    for (const e of validation.errors) {
      if (!grouped.has(e.row)) grouped.set(e.row, []);
      grouped.get(e.row).push(e);
    }
    return [...grouped.entries()].slice(0, 100);
  }, [validation]);

  const mappedFields = parsed ? parsed.fields.filter((f) => mapping[f.key] !== null && mapping[f.key] !== undefined) : [];
  const hasErrors = validation && validation.errorTotal > 0;

  return (
    <div>
      <Stepper step={step} />
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}

      {step === 0 && (
        <Card>
          <CardHeader title="Choisir un classeur Excel" description="Format .xlsx, 3 Mo maximum, 5 000 lignes maximum. La première ligne doit contenir les en-têtes." actions={<Button variant="secondary" icon={Download} onClick={() => downloadFile("/api/admin/import/template", { fallbackName: "modeleImport.xlsx" }).catch((e) => setError(e.message))}>Télécharger le modèle</Button>} />
          <div className="p-5">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-sand-300 bg-sand-50 px-6 py-12 text-center transition hover:border-brand-500 hover:bg-brand-50">
              <Upload className="mb-3 h-8 w-8 text-brand-700" aria-hidden="true" />
              <span className="text-sm font-semibold text-brand-950">{busy === "parse" ? "Analyse en cours…" : "Cliquez pour choisir un fichier .xlsx"}</span>
              <span className="mt-1 text-xs text-stone-500">Les formules ne sont jamais exécutées : seules les valeurs sont lues.</span>
              <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={onFile} disabled={busy === "parse"} />
            </label>
          </div>
        </Card>
      )}

      {step === 1 && parsed && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Associer les colonnes" description={`${filename} · ${fmtNumber(rows.length)} ligne(s) de données`} />
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {parsed.fields.map((f) => (
                <Field key={f.key} label={f.label} htmlFor={`map-${f.key}`} required={f.required}>
                  <Select id={`map-${f.key}`} value={mapping[f.key] === null || mapping[f.key] === undefined ? "" : mapping[f.key]} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}>
                    <option value="">— Ne pas importer —</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Aperçu" description="Les 8 premières lignes du fichier" />
            <Table>
              <thead>
                <tr>
                  <Th>Ligne</Th>
                  {parsed.headers.map((h, i) => (
                    <Th key={i}>{h}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((r) => (
                  <tr key={r.n}>
                    <Td className="text-xs text-stone-500">{r.n}</Td>
                    {r.v.map((c, i) => (
                      <Td key={i} className="max-w-[200px] truncate">
                        {c}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Mode d'import" />
            <div className="space-y-3 p-5">
              {[
                ["add", "Ajouter uniquement", "Les nouvelles familles sont ajoutées. Aucune donnée existante n'est modifiée ni écrasée. Les CIN déjà présents bloquent l'import."],
                ["replace", "Remplacer (réinitialisation)", "Remplace toutes les familles, tous les membres et tous les parrains. Les vendeurs, distributions, attributions et utilisateurs sont conservés ; l'historique reste visible sous forme d'instantané mais n'est plus relié aux familles remplacées."]
              ].map(([value, title, text]) => (
                <label key={value} className={cx("flex cursor-pointer gap-3 rounded-2xl border p-4", mode === value ? "border-brand-600 bg-brand-50" : "border-sand-200")}>
                  <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1 h-4 w-4 text-brand-700" />
                  <span>
                    <span className="block text-sm font-semibold text-brand-950">{title}</span>
                    <span className="block text-sm text-stone-600">{text}</span>
                  </span>
                </label>
              ))}
              {mode === "replace" && <Alert tone="warning">Mode destructif : pensez à télécharger l'instantané Excel actuel dans l'onglet « Réinitialisation » avant de continuer.</Alert>}
            </div>
          </Card>
          <div className="flex justify-between">
            <Button variant="secondary" icon={ArrowLeft} onClick={restart}>
              Changer de fichier
            </Button>
            <Button onClick={() => validate()} loading={busy === "validate"} disabled={mapping.fullName === null || mapping.fullName === undefined}>
              Valider les données <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && validation && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Lignes", validation.summary.totalRows],
              ["Lignes valides", validation.summary.validRows],
              ["Erreurs bloquantes", validation.errorTotal],
              ["Avertissements", validation.warningTotal]
            ].map(([label, value]) => (
              <Card key={label} className="p-5">
                <p className="text-sm text-stone-500">{label}</p>
                <p className={cx("mt-1 text-2xl font-semibold tabular-nums", label === "Erreurs bloquantes" && value > 0 ? "text-rose-600" : "text-brand-950")}>{fmtNumber(value)}</p>
              </Card>
            ))}
          </div>
          {!hasErrors ? (
            <Alert tone="success" title="Aucune erreur bloquante">
              {validation.summary.families} famille(s) et {validation.summary.members} personne(s) seront importées en mode « {mode === "replace" ? "remplacement" : "ajout"} ». {validation.summary.newSponsors > 0 && `${validation.summary.newSponsors} nouveau(x) parrain(s) potentiel(s).`}
            </Alert>
          ) : (
            <Alert tone="error" title="Des erreurs bloquantes doivent être corrigées">
              Corrigez les cellules en rouge ci-dessous, puis cliquez sur « Revalider ». L'import n'est possible que lorsqu'il n'y a plus aucune erreur.
            </Alert>
          )}

          {hasErrors && (
            <Card>
              <CardHeader
                title="Cellules à corriger"
                description={validation.errorTotal > validation.errors.length ? `${validation.errors.length} erreurs affichées sur ${validation.errorTotal} (les plus anciennes lignes d'abord).` : `${validation.errorTotal} erreur(s)`}
                actions={
                  <>
                    <Button variant="secondary" size="sm" icon={Download} onClick={report}>
                      Rapport d'erreurs
                    </Button>
                    <Button size="sm" icon={RefreshCw} onClick={() => validate()} loading={busy === "validate"}>
                      Revalider
                    </Button>
                  </>
                }
              />
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <Th>Ligne Excel</Th>
                      <Th>Colonne</Th>
                      <Th>Valeur d'origine</Th>
                      <Th>Erreur</Th>
                      <Th>Suggestion</Th>
                      <Th>Valeur corrigée</Th>
                      <Th>Statut</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorRows.flatMap(([rowNumber, list]) =>
                      list.map((e, i) => {
                        const editable = fieldByLabel[e.column] && mapping[fieldByLabel[e.column]] !== null && mapping[fieldByLabel[e.column]] !== undefined;
                        const current = cellValue(rowNumber, e.column);
                        const changed = editable && current !== e.value;
                        return (
                          <tr key={`${rowNumber}-${e.column}-${i}`} className="align-top">
                            <Td className="font-semibold tabular-nums">{rowNumber}</Td>
                            <Td>{e.column}</Td>
                            <Td className="max-w-[180px] break-words bg-rose-50 font-mono text-xs text-rose-800">{e.value || <em className="text-stone-400">vide</em>}</Td>
                            <Td className="max-w-sm text-rose-700">{e.message}</Td>
                            <Td>
                              {e.suggestion ? (
                                <Button size="sm" variant="subtle" icon={Wand2} onClick={() => setCell(rowNumber, e.column, e.suggestion)}>
                                  {e.suggestion}
                                </Button>
                              ) : (
                                <span className="text-stone-400">–</span>
                              )}
                            </Td>
                            <Td>
                              {editable ? (
                                <Input value={current} onChange={(ev) => setCell(rowNumber, e.column, ev.target.value)} className={cx("h-9 min-w-[160px]", !changed && "border-rose-400")} aria-label={`Correction ligne ${rowNumber}, ${e.column}`} />
                              ) : (
                                <span className="text-xs text-stone-400">Colonne non importée</span>
                              )}
                            </Td>
                            <Td>{changed ? <Badge tone="amber">À revalider</Badge> : <Badge tone="red">Invalide</Badge>}</Td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {validation.warnings.length > 0 && (
            <Card>
              <CardHeader title="Avertissements" description="Non bloquants : vérifiez-les avant d'importer. Aucun enregistrement n'est fusionné automatiquement." />
              <Table>
                <thead>
                  <tr>
                    <Th>Ligne</Th>
                    <Th>Colonne</Th>
                    <Th>Valeur</Th>
                    <Th>Détail</Th>
                    <Th>Suggestion</Th>
                  </tr>
                </thead>
                <tbody>
                  {validation.warnings.slice(0, 100).map((w, i) => (
                    <tr key={i}>
                      <Td className="tabular-nums">{w.row}</Td>
                      <Td>{w.column}</Td>
                      <Td>{w.value}</Td>
                      <Td>{w.message}</Td>
                      <Td>
                        {w.suggestion ? (
                          <Button size="sm" variant="subtle" icon={Wand2} onClick={() => { setCell(w.row, w.column, w.suggestion); }}>
                            Utiliser « {w.suggestion} »
                          </Button>
                        ) : (
                          "–"
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(1)}>
              Colonnes
            </Button>
            <div className="flex gap-3">
              <Button variant="secondary" icon={RefreshCw} onClick={() => validate()} loading={busy === "validate"}>
                Revalider
              </Button>
              <Button onClick={() => { setConfirmation(""); setConfirmOpen(true); }} disabled={hasErrors} icon={CheckCircle2}>
                Importer
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <Card>
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <CheckCircle2 className="mb-3 h-12 w-12 text-brand-600" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-brand-950">Import terminé</h2>
            <p className="mt-2 text-sm text-stone-600">
              {fmtNumber(result.families)} famille(s), {fmtNumber(result.members)} personne(s) et {fmtNumber(result.sponsors)} parrain(s) traité(s).
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/families">
                <Button>Voir les familles</Button>
              </Link>
              <Button variant="secondary" onClick={restart}>
                Nouvel import
              </Button>
            </div>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={commit}
        loading={busy === "commit"}
        tone={mode === "replace" ? "danger" : "primary"}
        title={mode === "replace" ? "Remplacer les données ?" : "Confirmer l'import ?"}
        message={
          mode === "replace"
            ? "Toutes les familles, tous les membres et tous les parrains actuels seront remplacés. Les vendeurs, distributions et utilisateurs sont conservés. L'opération est atomique : en cas d'échec, rien n'est modifié."
            : "Les nouvelles familles seront ajoutées. Aucune donnée existante ne sera modifiée. L'opération est atomique."
        }
        confirmLabel={mode === "replace" ? "Remplacer" : "Importer"}
        confirmDisabled={mode === "replace" && confirmation !== "REMPLACER"}
      >
        {mode === "replace" && (
          <Field label="Tapez REMPLACER pour confirmer" htmlFor="confirm-replace" className="mt-4">
            <Input id="confirm-replace" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </ConfirmDialog>
    </div>
  );
}

function ResetTab() {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState("families");
  const [phrase, setPhrase] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setPreview(await api("/api/admin/reset"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function exportSnapshot() {
    setExporting(true);
    try {
      await downloadFile("/api/admin/snapshot", { fallbackName: "instantane.xlsx" });
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function run() {
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/admin/reset", { method: "POST", body: { scope, confirmation: phrase } });
      setResult(data);
      setConfirmOpen(false);
      setPhrase("");
      load();
    } catch (err) {
      setError(err.message);
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const expected = preview ? preview.phrases[scope] : "";
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  const phraseOk = preview && norm(phrase) === norm(expected);

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      {result && (
        <Alert tone="success" title="Opération terminée">
          {Object.entries(result)
            .map(([k, v]) => `${k.replace("deleted", "Supprimé(s) : ")} ${v}`)
            .join(" · ")}
        </Alert>
      )}
      <Card>
        <CardHeader title="Avant de commencer" description="Exportez les données actuelles pour pouvoir les consulter ou les réimporter ensuite." actions={<Button variant="secondary" icon={FileSpreadsheet} onClick={exportSnapshot} loading={exporting}>Télécharger l'instantané Excel</Button>} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {[
          ["families", "Réinitialiser les familles et les parrains", preview && `${fmtNumber(preview.families.families)} famille(s), ${fmtNumber(preview.families.members)} personne(s), ${fmtNumber(preview.families.sponsors)} parrain(s) seront supprimés. Conservés : vendeurs, distributions, attributions (instantanés d'historique), utilisateurs, journaux d'audit, sauvegardes.`],
          ["history", "Supprimer l'historique des distributions", preview && `${fmtNumber(preview.history.distributions)} distribution(s) et ${fmtNumber(preview.history.assignments)} attribution(s) seront supprimées définitivement. Les familles, parrains et vendeurs sont conservés. Cette action détruit l'historique : exportez-le d'abord.`]
        ].map(([value, title, text]) => (
          <label key={value} className={cx("flex cursor-pointer gap-3 rounded-2xl border bg-white p-5 shadow-card", scope === value ? "border-rose-400 ring-1 ring-rose-300" : "border-sand-200")}>
            <input type="radio" name="scope" checked={scope === value} onChange={() => { setScope(value); setPhrase(""); }} className="mt-1 h-4 w-4 text-rose-600" />
            <span>
              <span className="block text-sm font-semibold text-brand-950">{title}</span>
              <span className="mt-1 block text-sm text-stone-600">{loading ? "Chargement…" : text}</span>
            </span>
          </label>
        ))}
      </div>
      <Card>
        <CardHeader title="Confirmation" description="Cette opération est réservée aux administrateurs, tracée dans le journal d'audit et exécutée dans une transaction." />
        <div className="space-y-4 p-5">
          <Alert tone="warning" title="Action irréversible">
            Aucun administrateur n'est supprimé. En cas d'échec, la base reste inchangée.
          </Alert>
          <Field label={`Tapez « ${expected} » pour confirmer`} htmlFor="reset-phrase">
            <Input id="reset-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" className="max-w-sm" />
          </Field>
          <Button variant="danger" icon={Trash2} disabled={!phraseOk} onClick={() => setConfirmOpen(true)}>
            Exécuter la réinitialisation
          </Button>
        </div>
      </Card>
      <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={run} loading={busy} title="Dernière confirmation" message="Voulez-vous vraiment exécuter cette opération ? Elle ne peut pas être annulée." confirmLabel="Oui, exécuter" />
    </div>
  );
}

export default function ImportExcel() {
  const [tab, setTab] = useState("import");
  return (
    <>
      <PageHeader title="Import Excel" description="Import administrateur en plusieurs étapes, validation complète avant écriture, et réinitialisation sécurisée des données." />
      <div className="mb-6">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "import", label: "Import" },
            { value: "reset", label: "Réinitialisation" }
          ]}
        />
      </div>
      {tab === "import" ? <ImportTab /> : <ResetTab />}
    </>
  );
}
