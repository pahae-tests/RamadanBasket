import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, PackageCheck, Plus, Store, Users } from "lucide-react";
import { fmtDate, fmtNumber } from "../../lib/clientApi";
import { Alert, Button, Card, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from "../../components/ui";
import ExportButton from "../../components/exportMenu";
import { useFetch } from "../../components/useFetch";

const PAGE_SIZE = 15;

export default function Distributions() {
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState("");
  const { data, loading, error, reload } = useFetch("/api/distributions", { page, pageSize: PAGE_SIZE });
  return (
    <>
      <PageHeader
        title="Distributions"
        description="Chaque famille reçoit un seul panier. Plusieurs distributions peuvent avoir lieu le même jour."
        actions={
          <>
            <ExportButton type="distributions" onError={setExportError} />
            <ExportButton type="history" label="Historique complet" onError={setExportError} />
            <Link href="/distributions/new">
              <Button icon={Plus}>Nouvelle distribution</Button>
            </Link>
          </>
        }
      />
      {exportError && (
        <Alert tone="error" className="mb-4">
          {exportError}
        </Alert>
      )}
      <Card className="overflow-hidden">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={4} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="Aucune distribution"
            description="Créez une distribution pour choisir des familles et les confier à vos vendeurs."
            action={
              <Link href="/distributions/new">
                <Button icon={Plus}>Nouvelle distribution</Button>
              </Link>
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-sand-100">
              {data.items.map((d) => (
                <li key={d.id}>
                  <Link href={`/distributions/${d.id}`} className="flex items-center gap-4 px-6 py-4 transition hover:bg-brand-50/60">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                      <CalendarDays className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold text-brand-950">{fmtDate(d.date)}</span>
                      <span className="block text-xs text-stone-500">Distribution n° {d.id}</span>
                    </span>
                    <span className="hidden items-center gap-1.5 text-sm font-semibold text-stone-600 sm:flex">
                      <Users className="h-4 w-4 text-brand-600" aria-hidden="true" /> {fmtNumber(d.families)} familles
                    </span>
                    <span className="hidden items-center gap-1.5 text-sm font-semibold text-stone-600 md:flex">
                      <Store className="h-4 w-4 text-gold-500" aria-hidden="true" /> {fmtNumber(d.vendors)} vendeur(s)
                    </span>
                    <ChevronRight className="h-5 w-5 text-stone-400" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
