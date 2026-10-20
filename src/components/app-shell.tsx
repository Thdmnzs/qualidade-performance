import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  History,
  LayoutDashboard,
  PieChart,
  MessageSquareWarning,
  Sparkles,
  TrendingUp,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { useRef, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lerPedidos } from "@/lib/escala-api";
import { lerMinhasTrocas, lerTrocasParaAprovar } from "@/lib/trocas-api";
import { apagarRegistros } from "@/lib/expiracao-da-sessao";
import { usePermissoes, useSessionUser } from "@/hooks/useAuth";
import { AcessoRapido, AcessoRapidoNoCelular } from "@/components/acesso-rapido";
import { BotaoTema } from "@/components/botao-tema";
import { CentralDeNotificacoes } from "@/components/central-de-notificacoes";
import { MenuDoUsuario } from "@/components/menu-do-usuario";
import { areaDoEndereco, itensDoMenu, trocaDeArea, type Area, type Rota } from "@/lib/areas";
import { rotuloPerfil } from "@/lib/format";

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  /** true quando a rota é "pai" de outras (ex.: /admin) e só deve acender na própria página */
  exact?: boolean;
};

/** Aparência de cada item. QUAIS itens cada perfil vê é decidido em lib/areas.ts. */
const NAV: Record<Rota, NavItem> = {
  "/painel": { label: "Visão geral", icon: LayoutDashboard },
  "/minhas-avaliacoes": { label: "Minhas avaliações", icon: ClipboardList },
  "/perfil": { label: "Meu perfil", icon: UserRound },
  "/contestacoes": { label: "Minhas contestações", icon: MessageSquareWarning },
  "/admin": { label: "Visão geral", icon: BarChart3, exact: true },
  "/admin/painel": { label: "Painel", icon: PieChart },
  "/admin/avaliacoes": { label: "Avaliações", icon: ClipboardCheck },
  "/admin/contestacoes": { label: "Contestações", icon: MessageSquareWarning },
  "/ranking": { label: "Ranking", icon: Trophy },
  "/escala": { label: "Escala", icon: CalendarDays },
  "/admin/indicadores": { label: "Indicadores", icon: Gauge },
  "/indicadores": { label: "Indicadores", icon: TrendingUp },
  "/admin/processos": { label: "Processos", icon: BookOpen },
  "/admin/treinar-a-ia": { label: "Treinar a IA", icon: Sparkles },
  "/admin/historico": { label: "Histórico", icon: History },
  "/admin/colaboradores": { label: "Colaboradores", icon: Users },
};

const ROTULO_AREA = { colaborador: "Área do colaborador", gestao: "Área de avaliação" } as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { employee, perfil } = usePermissoes();
  const { data: usuario } = useSessionUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // A área anterior: o Ranking existe nas duas áreas e mantém a de onde se veio.
  const areaAnterior = useRef<Area>("gestao");
  const area = areaDoEndereco(pathname, areaAnterior.current);
  areaAnterior.current = area;
  const troca = trocaDeArea(perfil, area);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    // Primeiro a sessão, depois a memória: senão, a tela busca o cadastro de novo no meio
    // do caminho e guarda um "ninguém logado" (o "Cadastro não vinculado" do próximo login).
    await queryClient.cancelQueries();
    apagarRegistros(); // o próximo login recomeça o prazo de 9 horas
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth", replace: true });
  }

  const itens = itensDoMenu(perfil, area).map((to) => ({ to, ...NAV[to] }));
  // O selo da Escala: para o ADM, os pedidos de férias e as trocas que aguardam a decisão dele.
  const { data: pedidosDeFerias = [] } = useQuery({
    queryKey: ["escala-pedidos"],
    queryFn: lerPedidos,
    enabled: perfil === "adm",
    refetchInterval: 5 * 60_000,
  });
  // As trocas: para o ADM, as que aguardam a supervisão; para o colaborador, os pedidos para ele.
  const { data: trocasDoAdm = [] } = useQuery({
    queryKey: ["trocas-para-aprovar"],
    queryFn: lerTrocasParaAprovar,
    enabled: perfil === "adm",
    refetchInterval: 5 * 60_000,
  });
  const { data: minhasTrocas = [] } = useQuery({
    queryKey: ["minhas-trocas"],
    queryFn: lerMinhasTrocas,
    enabled: !!employee && perfil !== "adm",
    refetchInterval: 5 * 60_000,
  });
  const aguardando =
    perfil === "adm"
      ? pedidosDeFerias.filter((p) => p.situacao === "aguardando").length +
        trocasDoAdm.filter((t) => t.situacao === "aguardando_supervisao").length
      : minhasTrocas.filter((t) => t.situacao === "aguardando_colega" && t.para.id === employee?.id)
          .length;
  const selo = (to: string) =>
    to === "/escala" && aguardando > 0 ? (
      <span
        className="ml-auto rounded-full bg-[#C2410C] px-1.5 text-[10px] font-bold text-white"
        aria-label={`${aguardando} ${aguardando === 1 ? "pedido aguardando" : "pedidos aguardando"} você`}
      >
        {aguardando}
      </span>
    ) : null;
  const menuDoUsuario = (
    <MenuDoUsuario
      nome={employee?.nome ?? "Usuário"}
      email={usuario?.email ?? null}
      perfil={`${perfil ? rotuloPerfil[perfil] : "—"}${perfil === "avaliador" ? ` · ${ROTULO_AREA[area]}` : ""}`}
      troca={troca}
      onSair={sair}
    />
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Fixo ao rolar a página: ocupa a altura da tela e, se os itens não couberem, rola por dentro. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar p-4 md:flex">
        <div className="px-2 py-4">
          {/* Logo colorida no claro; branca no escuro. */}
          <img
            src="/logo-fluke.png"
            alt="fluke"
            width={120}
            height={32}
            className="h-8 w-auto dark:hidden"
          />
          <img
            src="/logo-fluke-branca.png"
            alt="fluke"
            width={120}
            height={32}
            className="hidden h-8 w-auto dark:block"
          />
          <p className="mt-2 text-xs text-muted-foreground">CX Hub</p>
        </div>
        <nav className="mt-4 flex flex-col gap-1">
          {itens.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact ?? false }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold transition-colors"
              activeProps={{ className: "bg-primary/15 text-primary" }}
              inactiveProps={{
                className: "text-muted-foreground hover:bg-secondary hover:text-foreground",
              }}
            >
              <item.icon className="size-4" />
              {item.label}
              {selo(item.to)}
            </Link>
          ))}
        </nav>
        {/* O acesso rápido (14/10/2026): os links das ferramentas do time, embaixo do menu. */}
        <div className="mt-5 border-t border-border pt-4">
          <AcessoRapido perfil={perfil} pessoa={employee?.id} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra fixa no topo (computador): o menu do usuário fica à direita. */}
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-3 border-b border-border bg-background/90 px-8 backdrop-blur md:flex">
          <CentralDeNotificacoes />
          <BotaoTema />
          {menuDoUsuario}
        </header>
        <header className="flex items-center gap-2 overflow-x-auto border-b border-border bg-sidebar px-4 py-3 md:hidden">
          <img
            src="/logo-fluke.png"
            alt="fluke"
            width={68}
            height={18}
            className="mr-2 h-5 w-auto shrink-0 dark:hidden"
          />
          <img
            src="/logo-fluke-branca.png"
            alt="fluke"
            width={68}
            height={18}
            className="mr-2 hidden h-5 w-auto shrink-0 dark:block"
          />
          {itens.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-secondary px-3 py-1.5 text-xs font-medium"
            >
              {item.label}
              {selo(item.to)}
            </Link>
          ))}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AcessoRapidoNoCelular perfil={perfil} pessoa={employee?.id} />
            <CentralDeNotificacoes />
            <BotaoTema />
            {menuDoUsuario}
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
