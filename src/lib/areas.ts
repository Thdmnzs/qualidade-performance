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
export type Destino = { para: Inicio; aviso: string | null };

export function destinoAposLogin(perfil: Perfil, aba: AbaDeLogin): Destino {
  if (perfil === "adm") {
    return {
      para: INICIO_DA_AREA.adm,
      aviso: aba === "colaborador" ? "O perfil ADM usa apenas a área de gestão." : null,
    };
  }
  if (perfil === "avaliador") {
    return {
      para: aba === "avaliador" ? INICIO_DA_AREA.avaliador : INICIO_DA_AREA.colaborador,
      aviso: null,
    };
  }
  return {
    para: INICIO_DA_AREA.colaborador,
    aviso: aba === "avaliador" ? "Seu acesso não inclui a área de avaliador." : null,
  };
}

/** A área é derivada do endereço: tudo sob /admin (e o ranking) é gestão. */
export function areaDoEndereco(pathname: string): Area {
  return pathname.startsWith("/admin") || pathname.startsWith("/ranking")
    ? "gestao"
    : "colaborador";
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
  | "/admin/processos";

/** Itens do menu, na ordem, por perfil e área atual. */
export function itensDoMenu(perfil: Perfil | undefined, area: Area): Rota[] {
  if (perfil === "adm") {
    return [
      "/admin",
      "/admin/avaliacoes",
      "/admin/contestacoes",
      "/admin/indicadores",
      "/admin/processos",
      "/ranking",
      "/admin/colaboradores",
    ];
  }
  if (perfil === "avaliador" && area === "gestao") {
    return ["/admin/avaliacoes", "/admin/contestacoes"];
  }
  // Colaborador, e avaliador na área de colaborador.
  return ["/painel", "/minhas-avaliacoes", "/contestacoes", "/perfil"];
}

/** Atalho para trocar de área sem sair (só o avaliador tem as duas). */
export function trocaDeArea(perfil: Perfil | undefined, area: Area) {
  if (perfil !== "avaliador") return null;
  return area === "gestao"
    ? { para: INICIO_DA_AREA.colaborador, rotulo: "Ir para minha área de colaborador" }
    : { para: INICIO_DA_AREA.avaliador, rotulo: "Ir para a área de avaliação" };
}
