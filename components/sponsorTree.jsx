import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Pencil } from "lucide-react";
import { api, fmtNumber } from "../lib/clientApi";
import { Avatar, Button, ProgressBar, TypeBadge, cx } from "./ui";

function FamilyList({ sponsorId, total }) {
  const [state, setState] = useState({ status: "loading", items: [] });
  const [started, setStarted] = useState(false);
  if (!started) {
    setStarted(true);
    api("/api/families", { params: { sponsorId, page: 1, pageSize: 12 } })
      .then((data) => setState({ status: "ok", items: data.items }))
      .catch(() => setState({ status: "error", items: [] }));
  }
  if (state.status === "loading") return <p className="px-4 py-2 text-xs text-stone-500">Chargement des familles</p>;
  if (state.status === "error") return <p className="px-4 py-2 text-xs text-rose-600">Impossible de charger les familles.</p>;
  return (
    <ul className="space-y-1 py-1">
      {state.items.map((f) => (
        <li key={f.id}>
          <Link href={`/families/${f.id}`} className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm transition hover:bg-brand-50">
            {f.benefited ? <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" aria-label="Servie" /> : <Clock className="h-4 w-4 shrink-0 text-gold-500" aria-label="En attente" />}
            <span className="min-w-0 flex-1 truncate font-medium text-stone-800">{f.representativeName}</span>
            <span className="text-xs text-stone-500">{f.membersCount} membre(s)</span>
          </Link>
        </li>
      ))}
      {total > state.items.length && (
        <li>
          <Link href={`/families?sponsorId=${sponsorId}`} className="block px-3 py-1.5 text-xs font-semibold text-brand-700 hover:underline">
            Voir les {fmtNumber(total)} familles
          </Link>
        </li>
      )}
    </ul>
  );
}

function Node({ node, depth, onEdit, defaultOpen }) {
  const hasChildren = node.children.length > 0;
  const expandable = hasChildren || node.ownFamilies > 0;
  const [open, setOpen] = useState(defaultOpen && depth < 2);
  const rate = node.coverageRate || 0;
  return (
    <li>
      <div className={cx("flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-brand-50/60", depth === 0 && "bg-sand-50 ring-1 ring-sand-200")}>
        <button
          type="button"
          onClick={() => expandable && setOpen(!open)}
          className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-stone-500", expandable ? "hover:bg-sand-100" : "opacity-0")}
          aria-label={open ? `Replier ${node.name}` : `Déplier ${node.name}`}
          aria-expanded={expandable ? open : undefined}
          tabIndex={expandable ? 0 : -1}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Avatar name={node.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate font-bold text-brand-950">{node.name}</span>
            <TypeBadge type={node.type} count={node.subCount} />
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-stone-600">
          {node.canHaveFamilies || node.subCount > 0 ? (
            <div className="w-40">
              <div className="mb-1 flex justify-between font-semibold">
                <span>
                  {fmtNumber(node.benefited)} sur {fmtNumber(node.families)} famille(s)
                </span>
              </div>
              <ProgressBar value={rate} />
            </div>
          ) : (
            <span className="text-stone-400">Aucune famille</span>
          )}
          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(node)} aria-label={`Modifier ${node.name}`} />
        </div>
      </div>
      {open && (
        <div className="ml-5 border-l-2 border-sand-200 pl-3">
          {hasChildren && (
            <ul className="space-y-1.5 py-1.5">
              {node.children.map((c) => (
                <Node key={c.id} node={c} depth={depth + 1} onEdit={onEdit} defaultOpen={defaultOpen} />
              ))}
            </ul>
          )}
          {node.canHaveFamilies && node.ownFamilies > 0 && <FamilyList sponsorId={node.id} total={node.ownFamilies} />}
        </div>
      )}
    </li>
  );
}

export default function SponsorTree({ tree, onEdit }) {
  return (
    <ul className="space-y-2 p-4">
      {tree.map((n) => (
        <Node key={n.id} node={n} depth={0} onEdit={onEdit} defaultOpen />
      ))}
    </ul>
  );
}
