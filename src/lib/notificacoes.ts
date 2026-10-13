/**
 * A central de notificações (13/10/2026): para onde cada uma leva, e a contagem da bolinha.
 * Puro, para ser testado. A notificação guarda o TIPO; o caminho sai daqui, pelo perfil.
 */
export type Pendencia = {
  tipo: string;
  id: string;
  titulo: string;
  texto: string | null;
  quando: string;
};
export type Novidade = {
  id: string;
  tipo: string;
  titulo: string;
  texto: string | null;
  quando: string;
  lida: boolean;
};
export type Notificacoes = { pendencias: Pendencia[]; novidades: Novidade[] };
export type Perfil = "colaborador" | "avaliador" | "adm" | null | undefined;

const visaoGeral = (perfil: Perfil) => (perfil === "colaborador" ? "/painel" : "/admin");

export function rotaDaNotificacao(tipo: string, perfil: Perfil): string {
  switch (tipo) {
    case "troca_para_voce":
    case "troca_para_aprovar":
    case "ferias_para_decidir":
    case "troca":
    case "ferias":
    case "escala":
      return "/escala";
    case "contestacao_para_responder":
      return "/admin/contestacoes";
    case "contestacao":
      return "/contestacoes";
    case "resultado":
      return perfil === "colaborador" ? "/minhas-avaliacoes" : visaoGeral(perfil);
    case "conquista":
      return "/perfil";
    default:
      return visaoGeral(perfil); // o aniversário, e o que vier de novo
  }
}

/** A bolinha: as ações pendentes (até serem feitas) + as novidades não lidas. */
export const contagemDaBolinha = (n: Notificacoes | undefined) =>
  n ? n.pendencias.length + n.novidades.filter((x) => !x.lida).length : 0;
export const textoDaBolinha = (total: number) => (total > 9 ? "9+" : String(total));

const ICONES: Record<string, { icone: string; fundo: string }> = {
  troca_para_voce: { icone: "🔁", fundo: "bg-[#E0ECFF] dark:bg-[#13234A]" },
  troca_para_aprovar: { icone: "🔁", fundo: "bg-[#E0ECFF] dark:bg-[#13234A]" },
  troca: { icone: "🔁", fundo: "bg-[#E0ECFF] dark:bg-[#13234A]" },
  ferias_para_decidir: { icone: "🏖", fundo: "bg-[#FFEDD5] dark:bg-[#3A2410]" },
  ferias: { icone: "🏖", fundo: "bg-[#FFEDD5] dark:bg-[#3A2410]" },
  contestacao_para_responder: { icone: "⚖️", fundo: "bg-[#FFF4D6] dark:bg-[#2A2410]" },
  contestacao: { icone: "⚖️", fundo: "bg-[#FFF4D6] dark:bg-[#2A2410]" },
  resultado: { icone: "📊", fundo: "bg-primary/10" },
  escala: { icone: "🗓", fundo: "bg-primary/10" },
  conquista: { icone: "🏆", fundo: "bg-[#FDF2D6] dark:bg-[#2A2410]" },
  aniversario: { icone: "🎂", fundo: "bg-[#FCE7F3] dark:bg-[#3A1028]" },
};
export const iconeDaNotificacao = (tipo: string) =>
  ICONES[tipo] ?? { icone: "🔔", fundo: "bg-secondary" };

/** "há 12 min", "há 2 h", "ontem, 16:40", "seg, 14:15", "02/10" */
export function quandoFoi(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  const min = Math.floor((agora.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 6 * 60) return `há ${Math.floor(min / 60)} h`;
  const dia = (x: Date) => x.toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
  const hora = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  });
  const ontem = new Date(agora.getTime() - 86_400_000);
  if (dia(d) === dia(agora)) return `hoje, ${hora}`;
  if (dia(d) === dia(ontem)) return `ontem, ${hora}`;
  if (agora.getTime() - d.getTime() < 6 * 86_400_000)
    return `${d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Fortaleza" }).replace(".", "")}, ${hora}`;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Fortaleza",
  });
}
