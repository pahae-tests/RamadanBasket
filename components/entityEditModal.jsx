import { useEffect, useState } from "react";
import { api } from "../lib/clientApi";
import { cinError, phoneError, sanitizeCin } from "../lib/clientValidate";
import { Button, Field, Input, Modal, PhoneInput } from "./ui";
import SponsorTypeFields from "./sponsorTypeFields";

export default function EntityEditModal({ kind, entity, onClose, onSaved }) {
  const isSponsor = kind === "sponsor";
  const [name, setName] = useState("");
  const [cin, setCin] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [parentId, setParentId] = useState("");
  const [type, setType] = useState("classic");

  useEffect(() => {
    if (!entity) return;
    setName(isSponsor ? entity.fullName : entity.name);
    setCin(entity.cin || "");
    setPhone(entity.phone || "");
    setActive(entity.isActive !== false);
    setParentId(entity.parentId ? String(entity.parentId) : "");
    setType(entity.type || "classic");
    setErrors({});
    setMessage("");
  }, [entity, isSponsor]);

  async function submit(e) {
    if (e) e.preventDefault();
    if (busy) return;
    const next = {};
    if (name.trim().length < 2) next.name = "Le nom est obligatoire.";
    if (isSponsor && cinError(cin)) next.cin = cinError(cin);
    if (isSponsor && type === "sub" && !parentId) next.parentId = "Choisissez le parrain spécial.";
    if (phoneError(phone)) next.phone = phoneError(phone);
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setMessage("");
    try {
      const url = isSponsor ? `/api/sponsors/${entity.id}` : `/api/vendors/${entity.id}`;
      const body = isSponsor ? { fullName: name, cin, phone, type, parentId: Number(parentId) || null } : { name, phone, isActive: active };
      await api(url, { method: "PUT", body });
      onSaved();
    } catch (err) {
      setMessage(err.message);
      if (err.details && typeof err.details === "object") setErrors(err.details);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(entity)}
      onClose={onClose}
      title={isSponsor ? "Modifier le parrain" : "Modifier le vendeur"}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} loading={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nom complet" htmlFor="editName" required error={errors.name}>
          <Input id="editName" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="off" />
        </Field>
        {isSponsor && entity && (
          <SponsorTypeFields idPrefix="edit" type={type} onTypeChange={setType} parentId={parentId} onParentChange={(v) => {
            setParentId(v);
            setErrors((e) => ({ ...e, parentId: undefined }));
          }} errors={errors} excludeId={entity.id} />
        )}
        {isSponsor && (
          <Field label="CIN" htmlFor="editCin" error={errors.cin}>
            <Input id="editCin" value={cin} onChange={(e) => setCin(sanitizeCin(e.target.value))} error={errors.cin} className="uppercase" autoComplete="off" />
          </Field>
        )}
        <Field label="Téléphone" htmlFor="editPhone">
          <PhoneInput id="editPhone" value={phone} onChange={setPhone} error={errors.phone} />
        </Field>
        {!isSponsor && (
          <label className="flex items-center gap-3 rounded-2xl bg-sand-50 px-4 py-3 text-sm font-semibold text-brand-950 ring-1 ring-sand-200">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-sand-300 text-brand-600" />
            Vendeur actif (proposé dans les distributions)
          </label>
        )}
        {message && <p className="text-sm font-medium text-rose-600">{message}</p>}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
