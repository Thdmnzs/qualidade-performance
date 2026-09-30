import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  Trophy,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useIsManager } from "@/hooks/useAuth";
import { rotuloPerfil } from "@/lib/format";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  manager?: boolean;
  /** true quando a rota é "pai" de outras (ex.: /admin) e só deve acender na própria página */
  exact?: boolean;
};

const NAV: NavItem[] = [
  { to: "/painel", label: "Destaques de CX", icon: LayoutDashboard },
  { to: "/ranking", label: "Ranking", icon: Trophy, manager: true },
  { to: "/contestacoes", label: "Contestações", icon: MessageSquareWarning },
  { to: "/admin", label: "Visão geral", icon: BarChart3, manager: true, exact: true },
  { to: "/admin/avaliacoes", label: "Avaliações", icon: ClipboardCheck, manager: true },
  { to: "/admin/colaboradores", label: "Colaboradores", icon: Users, manager: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { isManager, employee, perfil } = useIsManager();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const itens = NAV.filter((i) => !i.manager || isManager);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar p-4 md:flex">
        <div className="px-2 py-4">
          <p className="font-display text-lg font-bold leading-tight text-primary">
            Qualidade &amp; Performance
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Plataforma interna de CX</p>
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1">
          {itens.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact ?? false }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              activeProps={{ className: "bg-primary/15 text-primary" }}
              inactiveProps={{
                className: "text-muted-foreground hover:bg-secondary hover:text-foreground",
              }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 rounded-lg border border-border p-3">
          <p className="truncate text-sm font-medium">{employee?.nome ?? "Usuário"}</p>
          <p className="text-xs text-muted-foreground">{perfil ? rotuloPerfil[perfil] : "—"}</p>
          <button
            onClick={sair}
            className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            <LogOut className="size-3.5" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 overflow-x-auto border-b border-border bg-sidebar px-4 py-3 md:hidden">
          {itens.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-full bg-secondary px-3 py-1.5 text-xs font-medium"
            >
              {item.label}
            </Link>
          ))}
          <button onClick={sair} className="ml-auto text-xs text-muted-foreground">
            Sair
          </button>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
