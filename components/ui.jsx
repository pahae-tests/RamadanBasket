import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, X, AlertTriangle, CheckCircle2, Info, ChevronLeft, ChevronRight, Inbox, Network, CornerDownRight, Layers, HandHeart } from "lucide-react";
import { initials, phoneError, sanitizePhone } from "../lib/clientValidate";
import { TYPE_LABELS } from "../lib/sponsorTypes";

export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary:
    "bg-gradient-to-b from-brand-500 to-brand-700 text-white shadow-glow hover:from-brand-500 hover:to-brand-800 active:translate-y-px",
  secondary: "bg-white text-brand-900 ring-1 ring-inset ring-sand-300 shadow-sm hover:bg-sand-50 hover:ring-brand-300",
  ghost: "text-brand-800 hover:bg-brand-50",
  danger: "bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-sm hover:from-rose-500 hover:to-rose-800",
  subtle: "bg-brand-50 text-brand-800 hover:bg-brand-100",
  gold: "bg-gradient-to-b from-gold-400 to-gold-500 text-brand-950 shadow-sm hover:from-gold-300 hover:to-gold-400"
};

export function Button({ variant = "primary", size = "md", loading = false, icon: Icon, className, children, disabled, ...props }) {
  const sizes = {
    sm: "h-9 px-3.5 text-sm gap-1.5",
    md: "h-11 px-5 text-sm gap-2",
    lg: "h-12 px-6 text-base gap-2.5"
  };
  const iconOnly = !children;
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-xl font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        buttonStyles[variant],
        sizes[size],
        iconOnly && "!px-0 aspect-square",
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, htmlFor, required, children, className }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-brand-950">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-stone-500">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  "block w-full rounded-xl border bg-white px-3.5 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 transition focus:outline-none focus:ring-4 disabled:bg-sand-100 disabled:text-stone-500";

export const Input = forwardRef(function Input({ error, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cx(inputBase, "h-11", error ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-sand-300 hover:border-sand-300 focus:border-brand-500 focus:ring-brand-100", className)}
      aria-invalid={error ? "true" : undefined}
      {...props}
    />
  );
});

export function PhoneInput({ value, onChange, error, showError = true, ...props }) {
  const message = error || (showError ? phoneError(value) : "");
  return (
    <>
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="06 12 34 56 78"
        value={value || ""}
        error={message}
        onChange={(e) => onChange(sanitizePhone(e.target.value))}
        {...props}
      />
      {message && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
          {message}
        </p>
      )}
    </>
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cx(inputBase, "h-11 border-sand-300 pr-9 focus:border-brand-500 focus:ring-brand-100", className)} {...props}>
      {children}
    </select>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cx("rounded-3xl bg-white shadow-card ring-1 ring-sand-200/80", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-5">
      <div>
        <h2 className="text-base font-bold tracking-tight text-brand-950">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-stone-100 text-stone-700",
  green: "bg-brand-100 text-brand-800",
  amber: "bg-gold-100 text-gold-600",
  red: "bg-rose-100 text-rose-700",
  blue: "bg-sky-100 text-sky-800"
};

export function ParentBadge({ name, className }) {
  if (!name) return null;
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800 ring-1 ring-inset ring-violet-300", className)} title={`Sous-parrain de ${name}`}>
      <CornerDownRight className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">Sous {name}</span>
    </span>
  );
}

const typeStyles = {
  group: ["bg-gold-100 text-gold-600 ring-gold-300", Network],
  special: ["bg-sky-100 text-sky-800 ring-sky-300", Layers],
  sub: ["bg-violet-100 text-violet-800 ring-violet-300", CornerDownRight],
  classic: ["bg-brand-100 text-brand-800 ring-brand-300", HandHeart]
};

export function TypeBadge({ type, count, className }) {
  const entry = typeStyles[type];
  if (!entry) return null;
  const [style, Icon] = entry;
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset", style, className)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {TYPE_LABELS[type]}
      {count ? ` (${count})` : ""}
    </span>
  );
}

export function Badge({ tone = "neutral", children, className }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", badgeTones[tone], className)}>{children}</span>;
}

export function StatusBadge({ status }) {
  const map = {
    success: ["green", "Réussi"],
    partial: ["amber", "Partiel"],
    failed: ["red", "Échec"],
    running: ["blue", "En cours"]
  };
  const [tone, label] = map[status] || ["neutral", status];
  return <Badge tone={tone}>{label}</Badge>;
}

const avatarTones = [
  "from-brand-400 to-brand-700",
  "from-teal-400 to-teal-700",
  "from-emerald-400 to-emerald-700",
  "from-gold-400 to-gold-600",
  "from-cyan-500 to-cyan-800",
  "from-lime-500 to-brand-700"
];

export function Avatar({ name, size = "md", className }) {
  const text = String(name || "?");
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.codePointAt(0)) % 997;
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base" };
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm", avatarTones[hash % avatarTones.length], sizes[size], className)} aria-hidden="true">
      {initials(text)}
    </span>
  );
}

export function Skeleton({ className }) {
  return <div className={cx("animate-pulse rounded-lg bg-sand-200", className)} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="space-y-3.5 p-6" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} className="h-5" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="text-base font-bold text-brand-950">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center" role="alert">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="text-base font-bold text-stone-900">Impossible de charger les données</p>
      <p className="mt-1 text-sm text-stone-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }) {
  const tones = {
    info: ["bg-sky-50 text-sky-900 ring-sky-200", Info],
    success: ["bg-brand-50 text-brand-900 ring-brand-200", CheckCircle2],
    warning: ["bg-gold-100/70 text-amber-900 ring-gold-300/70", AlertTriangle],
    error: ["bg-rose-50 text-rose-900 ring-rose-200", AlertTriangle]
  };
  const [style, Icon] = tones[tone];
  return (
    <div className={cx("flex gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ring-inset", style, className)} role={tone === "error" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-bold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = "md" }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement;
    const first = ref.current && ref.current.querySelector("input, select, textarea");
    if (first) first.focus();
    else if (ref.current) ref.current.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && previous.focus) previous.focus();
    };
  }, [open]);
  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade bg-brand-950/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx("relative z-10 flex max-h-[92vh] w-full animate-rise flex-col rounded-t-3xl bg-white shadow-pop focus:outline-none sm:rounded-3xl", widths[size])}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-brand-950">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-stone-500 transition hover:bg-sand-100" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-5 pt-1">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-3xl bg-sand-50 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirmer", tone = "danger", loading, children, confirmDisabled }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-stone-700">{message}</p>
      {children}
    </Modal>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm text-stone-600">
      <span>
        {fmt(from)}–{fmt(to)} sur {fmt(total)}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente" />
        <span className="min-w-20 text-center tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" icon={ChevronRight} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante" />
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions, breadcrumbs }) {
  return (
    <div className="mb-7">
      {breadcrumbs && (
        <nav aria-label="Fil d'Ariane" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
              {b.href ? (
                <Link href={b.href} className="font-medium hover:text-brand-700">
                  {b.label}
                </Link>
              ) : (
                <span className="text-stone-700">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-brand-950">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-stone-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "green" }) {
  const tones = {
    green: "bg-brand-50 text-brand-700 ring-brand-100",
    amber: "bg-gold-100 text-gold-600 ring-gold-300/60",
    red: "bg-rose-50 text-rose-600 ring-rose-100",
    blue: "bg-sky-50 text-sky-700 ring-sky-100"
  };
  return (
    <Card className="p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-500">{label}</p>
          <p className="mt-1.5 text-3xl font-extrabold tabular-nums tracking-tight text-brand-950">{value}</p>
          {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
        </div>
        {Icon && (
          <div className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1", tones[tone])}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
      </div>
    </Card>
  );
}

export function ProgressBar({ value, tone = "green" }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-sand-200" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-all duration-500", tone === "amber" ? "bg-gold-500" : "bg-gradient-to-r from-brand-400 to-brand-600")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, size = 168, stroke = 14, label, sublabel }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(pct)} pour cent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
        <defs>
          <linearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f4cd75" />
            <stop offset="100%" stopColor="#76d0b0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="text-4xl font-extrabold tabular-nums tracking-tight">{label}</span>
        {sublabel && <span className="mt-0.5 text-xs text-brand-100/80">{sublabel}</span>}
      </div>
    </div>
  );
}

export function Table({ children, className }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className={cx("min-w-full text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ children, className }) {
  return <th className={cx("whitespace-nowrap border-b border-sand-200 px-5 py-3 text-left text-xs font-semibold tracking-wide text-stone-500", className)}>{children}</th>;
}

export function Td({ children, className, ...props }) {
  return (
    <td className={cx("border-b border-sand-100 px-5 py-3.5 align-middle text-stone-800", className)} {...props}>
      {children}
    </td>
  );
}

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-sand-100 p-1.5 ring-1 ring-sand-200/70" role="tablist">
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(t.value)}
            className={cx(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition",
              active ? "bg-white text-brand-900 shadow-sm ring-1 ring-sand-200" : "text-stone-500 hover:text-stone-800"
            )}
          >
            {t.label}
            {t.count !== undefined && t.count !== null && (
              <span className={cx("rounded-full px-2 py-0.5 text-xs tabular-nums", active ? "bg-brand-100 text-brand-800" : "bg-sand-200 text-stone-600")}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast ? (
    <div className="fixed bottom-5 right-5 z-[60] max-w-sm animate-rise" aria-live="polite">
      <Alert tone={toast.tone} className="bg-white shadow-pop">
        {toast.message}
      </Alert>
    </div>
  ) : null;
  return { show: (message, tone = "success") => setToast({ message, tone }), node };
}
