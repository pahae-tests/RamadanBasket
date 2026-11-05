import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Search, Sparkles, X, Store, HandHeart } from "lucide-react";
import { api } from "../lib/clientApi";
import { cinError, phoneError, sanitizeCin } from "../lib/clientValidate";
import { Avatar, Button, Field, Input, Modal, ParentBadge, PhoneInput, TypeBadge, cx, useDebounced } from "./ui";
import SponsorTypeFields from "./sponsorTypeFields";

const KINDS = {
  sponsor: {
    label: "parrain",
    title: "Nouveau parrain",
    searchUrl: "/api/sponsors/search",
    createUrl: "/api/sponsors",
    placeholder: "Rechercher un parrain par nom, CIN ou téléphone",
    icon: HandHeart,
    getName: (s) => s.fullName,
    getSub: (s) => [s.cin, s.phone].filter(Boolean),
    createBody: (v) => ({ fullName: v.name, cin: v.cin, phone: v.phone, type: v.type, parentId: Number(v.parentId) || null }),
    hasCin: true
  },
  vendor: {
    label: "vendeur",
    title: "Nouveau vendeur",
    searchUrl: "/api/vendors/search",
    createUrl: "/api/vendors",
    placeholder: "Rechercher un vendeur par nom ou téléphone",
    icon: Store,
    getName: (s) => s.name,
    getSub: (s) => [s.phone].filter(Boolean),
    createBody: (v) => ({ name: v.name, phone: v.phone }),
    hasCin: false
  }
};

export function NewEntityModal({ kind, open, initialName, onClose, onCreated, allowedTypes }) {
  const cfg = KINDS[kind];
  const [name, setName] = useState("");
  const [cin, setCin] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [similar, setSimilar] = useState([]);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("classic");
  const [parentId, setParentId] = useState("");
  const debounced = useDebounced(name, 250);
  const firstType = allowedTypes && allowedTypes.length ? allowedTypes[0] : "classic";

  useEffect(() => {
    if (open) {
      setName(initialName || "");
      setCin("");
      setPhone("");
      setErrors({});
      setMessage("");
      setSimilar([]);
      setForce(false);
      setType(firstType);
      setParentId("");
    }
  }, [open, initialName, firstType]);

  useEffect(() => {
    if (!open) return undefined;
    const q = debounced.trim();
    if (q.length < 2) {
      setSimilar([]);
      return undefined;
    }
    let cancelled = false;
    api(cfg.searchUrl, { params: { q } })
      .then((data) => {
        if (cancelled) return;
        setSimilar(data.items.filter((i) => i.kind === "exact" || i.kind === "approx").slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open, cfg.searchUrl]);

  async function submit(e) {
    if (e) e.preventDefault();
    if (busy) return;
    const next = {};
    if (name.trim().length < 2) next.name = "Le nom est obligatoire.";
    if (cfg.hasCin && cinError(cin)) next.cin = cinError(cin);
    if (phoneError(phone)) next.phone = phoneError(phone);
    if (kind === "sponsor" && type === "sub" && !parentId) next.parentId = "Choisissez le parrain spécial.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await api(cfg.createUrl, { method: "POST", body: { ...cfg.createBody({ name, cin, phone, type, parentId }), force } });
      onCreated({ id: data.id, name: name.trim().replace(/\s+/g, " "), type, parentName: null });
    } catch (err) {
      if (err.status === 409 && err.details && err.details.similar) {
        setSimilar(err.details.similar.map((s) => ({ id: s.id, fullName: s.fullName, name: s.fullName, phone: s.phone, kind: s.kind })));
        setForce(true);
        setMessage(err.message);
      } else if (err.details && typeof err.details === "object") {
        setErrors(err.details);
        setMessage(err.message);
      } else {
        setMessage(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function pick(item) {
    onCreated({ id: item.id, name: cfg.getName(item) || item.fullName || item.name });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cfg.title}
      description={cfg.hasCin ? "Renseignez les informations du parrain. Il sera sélectionné automatiquement." : "Renseignez les informations du vendeur. Il sera sélectionné automatiquement."}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} loading={busy} icon={Plus}>
            {force ? "Créer quand même" : `Enregistrer le ${cfg.label}`}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nom complet" htmlFor="newEntityName" required error={errors.name}>
          <Input
            id="newEntityName"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setForce(false);
              setMessage("");
            }}
            error={errors.name}
            autoComplete="off"
          />
        </Field>
        {similar.length > 0 && (
          <div className="rounded-2xl bg-gold-100/70 p-3 ring-1 ring-gold-300/70" role="status">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Ce {cfg.label} existe peut-être déjà
            </p>
            <div className="mt-2 space-y-1.5">
              {similar.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-left text-sm shadow-sm ring-1 ring-gold-300/60 transition hover:bg-brand-50 hover:ring-brand-300"
                >
                  <Avatar name={cfg.getName(s) || s.fullName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-brand-950">Voulez-vous dire {cfg.getName(s) || s.fullName} ?</span>
                    <span className="block truncate text-xs text-stone-500">Cliquez pour le sélectionner</span>
                  </span>
                  <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-amber-900/80">Sinon, poursuivez : un nouveau {cfg.label} sera créé.</p>
          </div>
        )}
        {kind === "sponsor" && (
          <SponsorTypeFields idPrefix="newEntity" type={type} onTypeChange={setType} parentId={parentId} onParentChange={(v) => {
            setParentId(v);
            setErrors((e) => ({ ...e, parentId: undefined }));
          }} allowedTypes={allowedTypes} errors={errors} />
        )}
        {cfg.hasCin && (
          <Field label="CIN" htmlFor="newEntityCin" error={errors.cin || (cin ? cinError(cin) : "")}>
            <Input id="newEntityCin" value={cin} onChange={(e) => setCin(sanitizeCin(e.target.value))} placeholder="AB123456" className="uppercase" autoComplete="off" error={errors.cin || (cin ? cinError(cin) : "")} />
          </Field>
        )}
        <Field label="Téléphone" htmlFor="newEntityPhone">
          <PhoneInput id="newEntityPhone" value={phone} onChange={setPhone} error={errors.phone} />
        </Field>
        {message && <p className="text-sm font-medium text-rose-600">{message}</p>}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function SmartPicker({ kind = "sponsor", value, onChange, label, error, id, placeholder, allowCreate = true, allowedTypes, extraParams, clearable = true, inputClassName }) {
  const cfg = KINDS[kind];
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [state, setState] = useState("idle");
  const [active, setActive] = useState(-1);
  const [modal, setModal] = useState(false);
  const box = useRef(null);
  const debounced = useDebounced(text, 200);
  const paramsKey = JSON.stringify(extraParams || {});

  useEffect(() => {
    function onDoc(e) {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setState("loading");
    api(cfg.searchUrl, { params: { q: debounced.trim(), ...JSON.parse(paramsKey) } })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setActive(data.items.length ? 0 : -1);
        setState(data.items.length ? "ok" : "empty");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open, cfg.searchUrl, paramsKey]);

  function choose(item) {
    onChange({ id: item.id, name: cfg.getName(item), type: item.type || null, parentName: item.parentName || null });
    setText("");
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open && items[active]) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const Icon = cfg.icon;
  const typed = text.trim();

  return (
    <div ref={box} className="relative">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-brand-950">
          {label}
        </label>
      )}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          {value ? (
            <div className={cx("flex h-11 items-center justify-between gap-2 rounded-xl border bg-brand-50 pl-2 pr-1.5 text-sm", error ? "border-rose-300" : "border-brand-200")}>
              <span className="flex min-w-0 items-center gap-2.5 font-semibold text-brand-900">
                <Avatar name={value.name} size="sm" />
                <span className="truncate">{value.name}</span>
                {value.parentName && <ParentBadge name={value.parentName} />}
              </span>
              {clearable && (
                <button type="button" onClick={() => onChange(null)} className="rounded-lg p-1.5 text-brand-800 transition hover:bg-brand-100" aria-label={`Retirer le ${cfg.label}`}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
              <Input
                id={id}
                value={text}
                error={error}
                placeholder={placeholder || cfg.placeholder}
                className={cx("pl-10", inputClassName)}
                autoComplete="off"
                role="combobox"
                aria-expanded={open}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
                onChange={(e) => {
                  setText(e.target.value);
                  setOpen(true);
                }}
              />
            </>
          )}
        </div>
        {allowCreate && !value && (
          <Button variant="subtle" icon={Plus} onClick={() => setModal(true)} className="shrink-0">
            <span className="hidden sm:inline">Nouveau {cfg.label}</span>
            <span className="sm:hidden">Nouveau</span>
          </Button>
        )}
      </div>
      {open && !value && (
        <div className="absolute left-0 right-0 z-30 mt-2 max-h-80 animate-rise overflow-y-auto rounded-2xl bg-white p-1.5 shadow-pop ring-1 ring-sand-200 scrollbar-thin" role="listbox">
          {state === "loading" && items.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Recherche en cours
            </div>
          )}
          {state === "error" && <p className="px-3 py-3 text-sm text-rose-600">La recherche a échoué. Réessayez.</p>}
          {state === "empty" && (
            <p className="px-3 py-3 text-sm text-stone-500">
              {typed ? `Aucun ${cfg.label} ne correspond à « ${typed} ».` : `Aucun ${cfg.label} enregistré.`}
            </p>
          )}
          {items.map((item, index) => {
            const approx = item.kind === "approx";
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item)}
                className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition", index === active ? "bg-brand-50" : "hover:bg-sand-50")}
              >
                <Avatar name={cfg.getName(item)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-stone-900">{cfg.getName(item)}</span>
                    {item.type && item.type !== "classic" && <TypeBadge type={item.type} />}
                    {item.parentName && <ParentBadge name={item.parentName} />}
                  </span>
                  {cfg.getSub(item).length > 0 && (
                    <span className="flex gap-3 text-xs text-stone-500">
                      {cfg.getSub(item).map((part) => (
                        <span key={part} className="truncate">
                          {part}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                {approx && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-600">
                    <Sparkles className="h-3 w-3" aria-hidden="true" /> Proche
                  </span>
                )}
              </button>
            );
          })}
          {allowCreate && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setModal(true);
              }}
              className="mt-1 flex w-full items-center gap-3 rounded-xl border-t border-sand-100 px-3 py-3 text-left text-sm font-semibold text-brand-800 transition hover:bg-brand-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              Ajouter un nouveau {cfg.label}
              {typed ? ` « ${typed} »` : ""}
            </button>
          )}
        </div>
      )}
      {allowCreate && (
        <NewEntityModal
          kind={kind}
          allowedTypes={allowedTypes}
          open={modal}
          initialName={typed}
          onClose={() => setModal(false)}
          onCreated={(created) => {
            setModal(false);
            setText("");
            setOpen(false);
            onChange(created);
          }}
        />
      )}
    </div>
  );
}

export function SponsorPicker(props) {
  return <SmartPicker kind="sponsor" extraParams={{ familiesOnly: 1 }} allowedTypes={["classic", "sub"]} {...props} />;
}

export function VendorPicker(props) {
  return <SmartPicker kind="vendor" extraParams={{ onlyActive: true }} {...props} />;
}
