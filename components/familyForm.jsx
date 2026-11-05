import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, MapPin, Plus, Save, SaveAll, Trash2, UserPlus } from "lucide-react";
import { api } from "../lib/clientApi";
import { cinError, phoneError, sanitizeCin } from "../lib/clientValidate";
import { Alert, Avatar, Button, Card, CardHeader, Field, Input, PhoneInput, useDebounced, useToast } from "./ui";
import { SponsorPicker } from "./smartPicker";

const emptyPerson = () => ({ fullName: "", cin: "", phone: "" });
let memberCounter = 0;
const newMember = (phone) => ({ key: `new-${++memberCounter}`, fullName: "", cin: "", phone: phone || "", phoneTouched: false });

function CinField({ value, onChange, error, excludeFamilyId, id, label, required }) {
  const [state, setState] = useState({ kind: "idle" });
  const debounced = useDebounced(value, 350);
  const latest = useRef(0);
  const formatError = value ? cinError(value) : "";

  useEffect(() => {
    const cin = debounced.trim();
    if (!cin || cinError(cin)) {
      setState({ kind: "idle" });
      return undefined;
    }
    const ticket = ++latest.current;
    setState({ kind: "loading" });
    api("/api/families/checkCin", { params: { cin, excludeFamilyId } })
      .then((r) => {
        if (ticket !== latest.current) return;
        if (!r.valid) setState({ kind: "invalid" });
        else if (!r.available) setState({ kind: "taken", existing: r.existing });
        else setState({ kind: "ok" });
      })
      .catch(() => {
        if (ticket === latest.current) setState({ kind: "idle" });
      });
    return undefined;
  }, [debounced, excludeFamilyId]);

  const taken = state.kind === "taken";
  const shownError = error || formatError;
  return (
    <Field label={label} htmlFor={id} required={required} error={shownError}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(sanitizeCin(e.target.value))}
          placeholder="AB123456"
          error={shownError || taken}
          autoComplete="off"
          className="pr-10 uppercase"
        />
        <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
          {state.kind === "loading" && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
          {state.kind === "ok" && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
          {taken && <AlertCircle className="h-4 w-4 text-rose-500" />}
        </div>
      </div>
      {taken && (
        <p className="mt-1.5 text-xs font-medium text-rose-600">
          CIN déjà enregistré pour {state.existing.fullName}
          {state.existing.representativeName && !state.existing.isRepresentative ? ` (famille de ${state.existing.representativeName})` : ""}.{" "}
          <Link href={`/families/${state.existing.familyId}`} className="inline-flex items-center gap-1 underline" target="_blank">
            Ouvrir la famille <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      )}
    </Field>
  );
}

function MemberRow({ member, index, errors, excludeFamilyId, onChange, onRemove, onEnter }) {
  return (
    <li className="grid gap-3 rounded-2xl bg-sand-50/80 p-4 ring-1 ring-sand-200/70 sm:grid-cols-12">
      <div className="flex items-center gap-3 sm:col-span-12">
        <Avatar name={member.fullName || String(index + 1)} size="sm" />
        <p className="flex-1 text-sm font-semibold text-brand-950">Membre {index + 1}</p>
        <Button variant="ghost" size="sm" icon={Trash2} onClick={onRemove} aria-label={`Retirer le membre ${index + 1}`} className="text-rose-600 hover:bg-rose-50" />
      </div>
      <Field label="Nom complet" htmlFor={`m-name-${index}`} required className="sm:col-span-5" error={errors[`members.${index}.fullName`]}>
        <Input
          id={`m-name-${index}`}
          value={member.fullName}
          onChange={(e) => onChange({ fullName: e.target.value })}
          error={errors[`members.${index}.fullName`]}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
        />
      </Field>
      <Field label="Téléphone" htmlFor={`m-phone-${index}`} className="sm:col-span-4" error={errors[`members.${index}.phone`]}>
        <PhoneInput id={`m-phone-${index}`} value={member.phone} onChange={(v) => onChange({ phone: v, phoneTouched: true })} error={errors[`members.${index}.phone`]} />
      </Field>
      <div className="sm:col-span-3">
        <CinField id={`m-cin-${index}`} label="CIN (facultatif)" value={member.cin} onChange={(v) => onChange({ cin: v })} error={errors[`members.${index}.cin`]} excludeFamilyId={excludeFamilyId} />
      </div>
    </li>
  );
}

export default function FamilyForm({ familyId, initial, onSaved }) {
  const router = useRouter();
  const [rep, setRep] = useState(initial ? initial.rep : emptyPerson());
  const [members, setMembers] = useState(
    initial ? initial.members.map((m) => ({ ...m, key: `m-${m.id}`, phoneTouched: (m.phone || "") !== (initial.rep.phone || "") })) : []
  );
  const [sponsor, setSponsor] = useState(initial ? initial.sponsor : null);
  const [address, setAddress] = useState(initial ? initial.address || "" : "");
  const [showAddress, setShowAddress] = useState(Boolean(initial && initial.address));
  const [errors, setErrors] = useState({});
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nameRef = useRef(null);

  function updateRep(patch) {
    setRep((r) => ({ ...r, ...patch }));
    if (patch.phone !== undefined) {
      setMembers((list) => list.map((m) => (m.phoneTouched ? m : { ...m, phone: patch.phone })));
    }
  }

  function updateMember(key, patch) {
    setMembers((list) => list.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  function addMember() {
    setMembers((list) => [...list, newMember(rep.phone)]);
    setTimeout(() => {
      const inputs = document.querySelectorAll("[id^='m-name-']");
      const last = inputs[inputs.length - 1];
      if (last) last.focus();
    }, 30);
  }

  function reset() {
    setRep(emptyPerson());
    setMembers([]);
    setSponsor(null);
    setAddress("");
    setShowAddress(false);
    setErrors({});
    setFormErr("");
    if (nameRef.current) nameRef.current.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateLocal() {
    const next = {};
    if (rep.fullName.trim().length < 2) next["representative.fullName"] = "Le nom est obligatoire.";
    if (!rep.cin) next["representative.cin"] = "Le CIN est obligatoire.";
    else if (cinError(rep.cin)) next["representative.cin"] = cinError(rep.cin);
    if (phoneError(rep.phone)) next["representative.phone"] = phoneError(rep.phone);
    if (!sponsor) next.sponsorId = "Le parrain est obligatoire.";
    members.forEach((m, i) => {
      const filled = m.fullName.trim() || m.cin;
      if (!filled) return;
      if (m.fullName.trim().length < 2) next[`members.${i}.fullName`] = "Le nom est obligatoire.";
      if (m.cin && cinError(m.cin)) next[`members.${i}.cin`] = cinError(m.cin);
      if (phoneError(m.phone)) next[`members.${i}.phone`] = phoneError(m.phone);
    });
    return next;
  }

  async function save(addAnother) {
    if (busy) return;
    const local = validateLocal();
    setErrors(local);
    setFormErr("");
    if (Object.keys(local).length) {
      setFormErr("Corrigez les champs signalés avant d'enregistrer.");
      return;
    }
    setBusy(true);
    const kept = members.filter((m) => m.fullName.trim() || m.cin);
    const body = {
      representative: { fullName: rep.fullName, cin: rep.cin, phone: rep.phone },
      members: kept.map((m) => ({ ...(m.id ? { id: m.id } : {}), fullName: m.fullName, cin: m.cin, phone: m.phone })),
      sponsorId: sponsor ? sponsor.id : null,
      address
    };
    try {
      if (familyId) {
        await api(`/api/families/${familyId}`, { method: "PUT", body });
        toast.show("Famille mise à jour.");
        if (onSaved) onSaved(familyId);
      } else {
        const data = await api("/api/families", { method: "POST", body });
        if (addAnother) {
          toast.show("Famille enregistrée. Vous pouvez en saisir une autre.");
          reset();
        } else {
          router.push(`/families/${data.id}`);
        }
      }
    } catch (err) {
      if (err.details && typeof err.details === "object") setErrors(err.details);
      setFormErr(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
      className="space-y-6 pb-28"
      noValidate
    >
      {formErr && <Alert tone="error">{formErr}</Alert>}
      <Card>
        <CardHeader title="Responsable de famille" description="Le responsable est le premier membre de la famille." />
        <div className="grid gap-5 px-6 pb-6 pt-3 sm:grid-cols-3">
          <Field label="Nom complet" htmlFor="repName" required error={errors["representative.fullName"]}>
            <Input id="repName" ref={nameRef} value={rep.fullName} onChange={(e) => updateRep({ fullName: e.target.value })} error={errors["representative.fullName"]} autoFocus autoComplete="off" />
          </Field>
          <CinField id="repCin" label="CIN" required value={rep.cin} onChange={(v) => updateRep({ cin: v })} error={errors["representative.cin"]} excludeFamilyId={familyId} />
          <Field label="Téléphone" htmlFor="repPhone" error={errors["representative.phone"]}>
            <PhoneInput id="repPhone" value={rep.phone} onChange={(v) => updateRep({ phone: v })} error={errors["representative.phone"]} />
          </Field>
          <div className="sm:col-span-3">
            <label htmlFor="sponsor" className="mb-1.5 block text-sm font-semibold text-brand-950">
              Parrain<span className="ml-0.5 text-rose-500">*</span>
            </label>
            <SponsorPicker id="sponsor" value={sponsor} onChange={setSponsor} error={errors.sponsorId} />
            {errors.sponsorId && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
                {errors.sponsorId}
              </p>
            )}
          </div>
          {showAddress ? (
            <Field label="Adresse" htmlFor="address" className="sm:col-span-3">
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
            </Field>
          ) : (
            <div className="sm:col-span-3">
              <button type="button" onClick={() => setShowAddress(true)} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 transition hover:text-brand-900">
                <MapPin className="h-4 w-4" aria-hidden="true" /> Ajouter une adresse
              </button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Autres membres"
          description={members.length ? `${members.length} membre(s) en plus du responsable. Le téléphone du responsable est repris par défaut.` : "Ajoutez les personnes qui vivent avec le responsable."}
          actions={
            <Button variant="subtle" size="sm" icon={UserPlus} onClick={addMember}>
              Ajouter un membre
            </Button>
          }
        />
        <div className="px-6 pb-6 pt-3">
          {members.length === 0 ? (
            <button
              type="button"
              onClick={addMember}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sand-300 py-8 text-sm font-semibold text-stone-500 transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter le premier membre
            </button>
          ) : (
            <ul className="space-y-3">
              {members.map((m, i) => (
                <MemberRow
                  key={m.key}
                  member={m}
                  index={i}
                  errors={errors}
                  excludeFamilyId={familyId}
                  onChange={(patch) => updateMember(m.key, patch)}
                  onRemove={() => setMembers((l) => l.filter((x) => x.key !== m.key))}
                  onEnter={addMember}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-sand-200 bg-white/90 px-4 py-3 backdrop-blur-md lg:left-[280px]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-3 sm:px-4">
          <Button variant="ghost" onClick={() => router.back()} disabled={busy}>
            Annuler
          </Button>
          {!familyId && (
            <Button variant="secondary" icon={SaveAll} loading={busy} onClick={() => save(true)}>
              Enregistrer et ajouter une autre
            </Button>
          )}
          <Button type="submit" icon={Save} loading={busy}>
            {familyId ? "Enregistrer" : "Enregistrer la famille"}
          </Button>
        </div>
      </div>
      {toast.node}
    </form>
  );
}
