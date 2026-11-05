import { useEffect, useState } from "react";
import { api } from "../lib/clientApi";
import { PARENT_TYPES, TYPE_HELP, TYPE_LABELS } from "../lib/sponsorTypes";
import { Alert, Field, Select } from "./ui";

const PARENT_LABEL = {
  group: "Super-parrain",
  special: "Parrain spécial"
};

export function parentRequired(type) {
  return type === "sub";
}

export function parentKind(type) {
  return PARENT_TYPES[type] && PARENT_TYPES[type][0] ? PARENT_TYPES[type][0] : null;
}

export default function SponsorTypeFields({ idPrefix, type, onTypeChange, parentId, onParentChange, allowedTypes, errors = {}, excludeId = null, disabled = false }) {
  const [parents, setParents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const wanted = parentKind(type);

  useEffect(() => {
    if (!wanted) {
      setParents([]);
      setLoaded(true);
      return undefined;
    }
    let cancelled = false;
    setLoaded(false);
    api("/api/sponsors", { params: { type: wanted, pageSize: 100 } })
      .then((data) => {
        if (cancelled) return;
        setParents(data.items.filter((p) => p.id !== excludeId));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setParents([]);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, excludeId]);

  const types = allowedTypes || Object.keys(TYPE_LABELS);
  const required = parentRequired(type);
  const missing = loaded && wanted && parents.length === 0;

  return (
    <>
      <Field label="Type de parrain" htmlFor={`${idPrefix}Type`} hint={TYPE_HELP[type]} error={errors.type}>
        <Select
          id={`${idPrefix}Type`}
          value={type}
          disabled={disabled}
          onChange={(e) => {
            onTypeChange(e.target.value);
            onParentChange("");
          }}
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      {wanted && (
        <Field
          label={required ? `${PARENT_LABEL[wanted]} (obligatoire)` : `${PARENT_LABEL[wanted]} de rattachement`}
          htmlFor={`${idPrefix}Parent`}
          required={required}
          hint={required ? "Un sous-parrain dépend toujours d'un parrain spécial." : "Laissez vide pour un parrain indépendant."}
          error={errors.parentId}
        >
          <Select id={`${idPrefix}Parent`} value={parentId} onChange={(e) => onParentChange(e.target.value)}>
            <option value="">{required ? "Choisir un parrain spécial" : "Aucun, parrain indépendant"}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {missing && required && <Alert tone="warning">Aucun parrain spécial n'existe encore. Créez-en un d'abord, puis ajoutez ses sous-parrains.</Alert>}
    </>
  );
}
