/**
 * Áreas da plataforma e para onde cada perfil vai.
 *
 * Regra de negócio (30/09/2026): o avaliador também é colaborador. A mesma
 * conta dá acesso às duas áreas; a aba escolhida no login decide a de entrada.
 * O ADM não é colaborador: usa só a área de gestão.
 *
 * Isto decide só a NAVEGAÇÃO. O que cada um pode ler e gravar é decidido pelo
 * banco (RLS e funções), independentemente da área em que a pessoa está.
 */
import type { Perfil } from "@/hooks/useAuth";

export type AbaDeLogin = "colaborador" | "avaliador";
export type Area = "colaborador" | "gestao";

export const INICIO_DA_AREA = {
  colaborador: "/painel",
  avaliador: "/admin/avaliacoes",
  adm: "/admin",
} as const;

export type Inicio = (typeof INICIO_DA_AREA)[keyof typeof INICIO_DA_AREA];
/** Ou a área de entrada, ou o motivo do bloqueio (a aba errada não deixa entrar). */
export type Destino = { para: Inicio; bloqueio: null } | { para: null; bloqueio: string };

/**
 * Para onde ir depois do login. Desde 08/10/2026, a aba errada BLOQUEIA o login
 * (antes, a pessoa entrava e só depois era avisada): o colaborador entra pela aba
 * Colaborador; o ADM, pela aba Avaliador (a gestão); o avaliador, pelas duas.
 */
export function destinoAposLogin(perfil: Perfil, aba: AbaDeLogin): Destino {
  if (perfil === "adm") {
    return aba === "avaliador"
      ? { para: INICIO_DA_AREA.adm, bloqueio: null }
      : { para: null, bloqueio: "O perfil ADM entra pela aba Avaliador." };
  }
  if (perfil === "avaliador") {
    return {
      para: aba === "avaliador" ? INICIO_DA_AREA.avaliador : INICIO_DA_AREA.colaborador,
      bloqueio: null,
    };
  }
  return aba === "colaborador"
    ? { para: INICIO_DA_AREA.colaborador, bloqueio: null }
    : {
        para: null,
        bloqueio: "Este acesso é de colaborador. Escolha a aba Colaborador para entrar.",
      };
}

/** A área de início de cada perfil, para quem já está logado (sem a escolha da aba). */
export function inicioDoPerfil(perfil: Perfil): Inicio {
  return perfil === "adm" ? INICIO_DA_AREA.adm : INICIO_DA_AREA.colaborador;
}

/** A área é derivada do endereço: tudo sob /admin (e o ranking) é gestão. */
/** As páginas que existem nas DUAS áreas (o mesmo endereço nos dois menus). */
const DAS_DUAS_AREAS = ["/ranking"];

/**
 * A área pelo endereço. Numa página das duas áreas (o Ranking), vale a área em
 * que a pessoa JÁ estava: o avaliador que abre o Ranking pela área de colaborador
 * continua nela (correção de 07/10/2026). Sem área anterior (aberto direto, por
 * um favorito), vale a gestão, como antes.
 */
export function areaDoEndereco(pathname: string, anterior: Area = "gestao"): Area {
  if (pathname.startsWith("/admin")) return "gestao";
  if (DAS_DUAS_AREAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return anterior;
  return "colaborador";
}

export type Rota =
  | "/painel"
  | "/minhas-avaliacoes"
  | "/contestacoes"
  | "/perfil"
  | "/admin"
  | "/admin/avaliacoes"
  | "/admin/contestacoes"
  | "/ranking"
  | "/admin/colaboradores"
  | "/admin/indicadores"
  | "/admin/processos"
  | "/admin/historico"
  | "/indicadores"
  | "/admin/painel";

/** Itens do menu, na ordem, por perfil e área atual. */
export function itensDoMenu(perfil: Perfil | undefined, area: Area): Rota[] {
  if (perfil === "adm") {
    return [
      "/admin",
      "/admin/painel",
      "/admin/avaliacoes",
      "/admin/contestacoes",
      "/admin/indicadores",
      "/admin/processos",
      "/admin/historico",
      "/ranking",
      "/admin/colaboradores",
    ];
  }
  if (perfil === "avaliador" && area === "gestao") {
    // O Ranking: desde 07/10/2026, o avaliador vê só o pódio publicado, como o colaborador.
    return ["/admin/avaliacoes", "/admin/contestacoes", "/ranking"];
  }
  // Colaborador, e avaliador na área de colaborador.
  return ["/painel", "/minhas-avaliacoes", "/contestacoes", "/indicadores", "/ranking", "/perfil"];
}

/** Atalho para trocar de área sem sair (só o avaliador tem as duas). */
export function trocaDeArea(perfil: Perfil | undefined, area: Area) {
  if (perfil !== "avaliador") return null;
  return area === "gestao"
    ? { para: INICIO_DA_AREA.colaborador, rotulo: "Ir para minha área de colaborador" }
    : { para: INICIO_DA_AREA.avaliador, rotulo: "Ir para a área de avaliação" };
}
