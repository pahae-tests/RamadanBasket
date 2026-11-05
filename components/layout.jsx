import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard,
  Users,
  HandHeart,
  Store,
  PackageCheck,
  BarChart3,
  ShieldCheck,
  UserCog,
  FileSpreadsheet,
  DatabaseBackup,
  Menu,
  X,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Loader2,
  Wheat
} from "lucide-react";
import { useAuth } from "./authContext";
import { Avatar, cx } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/families", label: "Familles", icon: Users },
  { href: "/sponsors", label: "Parrains", icon: HandHeart },
  { href: "/vendors", label: "Vendeurs", icon: Store },
  { href: "/distributions", label: "Distributions", icon: PackageCheck },
  { href: "/statistics", label: "Statistiques", icon: BarChart3 },
  { href: "/dataQuality", label: "Qualité des données", icon: ShieldCheck },
  { href: "/users", label: "Utilisateurs", icon: UserCog, admin: true },
  { href: "/importExcel", label: "Import Excel", icon: FileSpreadsheet, admin: true },
  // { href: "/backups", label: "Sauvegardes", icon: DatabaseBackup, admin: true }
];

function NavList({ items, pathname, collapsed, onNavigate }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Navigation principale">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition",
              active ? "bg-white/[0.14] text-white shadow-inner ring-1 ring-white/10" : "text-brand-100/75 hover:bg-white/[0.08] hover:text-white",
              collapsed && "justify-center px-2"
            )}
          >
            {active && <span className="absolute -left-3 top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-r-full bg-gold-400" aria-hidden="true" />}
            <Icon className={cx("h-5 w-5 shrink-0", active ? "text-gold-300" : "text-brand-200/80 group-hover:text-white")} aria-hidden="true" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }) {
  return (
    <div className={cx("flex h-20 items-center gap-3 px-5", collapsed && "justify-center px-2")}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-300 to-gold-500 text-brand-950 shadow-lg shadow-black/20">
        <Wheat className="h-6 w-6" aria-hidden="true" />
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-base font-extrabold tracking-tight text-white">Ramadan Basket</p>
          <p className="text-xs font-medium text-brand-200/80">Gestion des paniers</p>
        </div>
      )}
    </div>
  );
}

const SIDEBAR_SURFACE = "bg-gradient-to-b from-brand-900 via-brand-950 to-[#031d18] pattern-star";

export default function Layout({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    setDrawer(false);
  }, [router.pathname, router.asPath]);

  useEffect(() => {
    if (!user) return;
    if (router.pathname.match(/^\/(users|importExcel|backups)/) && user.role !== "admin") router.replace("/dashboard");
  }, [user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-700" aria-label="Chargement" />
      </div>
    );
  }

  const items = NAV.filter((n) => !n.admin || user.role === "admin");

  return (
    <div className="min-h-screen">
      <aside
        className={cx(
          "fixed inset-y-3 left-3 z-30 hidden flex-col overflow-hidden rounded-[28px] shadow-pop transition-all duration-200 lg:flex",
          SIDEBAR_SURFACE,
          collapsed ? "w-[84px]" : "w-64"
        )}
      >
        <Brand collapsed={collapsed} />
        <NavList items={items} pathname={router.pathname} collapsed={collapsed} />
        <div className="p-3">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium text-brand-100/70 transition hover:bg-white/10 hover:text-white"
            aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            {!collapsed && <span>Replier</span>}
          </button>
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-brand-950/60 backdrop-blur-sm" onClick={() => setDrawer(false)} aria-hidden="true" />
          <aside className={cx("absolute inset-y-0 left-0 flex w-72 animate-rise flex-col shadow-pop", SIDEBAR_SURFACE)}>
            <div className="flex items-center justify-between pr-3">
              <div className="flex-1">
                <Brand collapsed={false} />
              </div>
              <button type="button" onClick={() => setDrawer(false)} className="rounded-xl p-2 text-white hover:bg-white/10" aria-label="Fermer le menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList items={items} pathname={router.pathname} collapsed={false} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className={cx("transition-all duration-200", collapsed ? "lg:pl-[108px]" : "lg:pl-[280px]")}>
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between bg-sand-50/85 px-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setDrawer(true)} className="rounded-xl bg-white p-2.5 text-brand-900 shadow-sm ring-1 ring-sand-200 lg:hidden" aria-label="Ouvrir le menu">
              <Menu className="h-5 w-5" />
            </button>
            <p className="hidden text-sm font-medium capitalize text-stone-500 sm:block">
              {new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-white py-1.5 pl-1.5 pr-1.5 shadow-sm ring-1 ring-sand-200">
            <Avatar name={user.username} size="sm" />
            <div className="hidden pr-1 leading-tight sm:block">
              <p className="text-sm font-bold text-brand-950">{user.username}</p>
              <p className="text-xs text-stone-500">{user.role === "admin" ? "Administrateur" : "Utilisateur"}</p>
            </div>
            <button type="button" onClick={logout} className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-stone-600 transition hover:bg-rose-50 hover:text-rose-700" aria-label="Se déconnecter">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-3 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
