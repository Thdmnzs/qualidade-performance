/**
 * A aparência do perfil (11/10/2026): o catálogo das capas e das molduras, as
 * temporadas (com os meses fixos de cada ano) e o "Quase lá". Puro, para ser testado.
 *
 * As REGRAS de desbloqueio valem no banco (a função que salva as confere); aqui ficam
 * os nomes, os textos das regras e as contas da tela. Os códigos são os mesmos do banco.
 */
export type ItemDaAparencia = {
  id: string;
  nome: string;
  regra: string; // o texto para quem ainda não desbloqueou
  grupo: "fluke" | "sazonal";
  mes?: number; // as sazonais: o mês em que ficam disponíveis
  solidaria?: boolean;
};

export const CAPAS: ItemDaAparencia[] = [
  { id: "sinal", nome: "Sinal", regra: "Livre", grupo: "fluke" },
  { id: "ondas", nome: "Ondas de sinal", regra: "Livre", grupo: "fluke" },
  { id: "brilho", nome: "Brilho verde", regra: "Livre", grupo: "fluke" },
  { id: "faixas", nome: "Faixas", regra: "Livre", grupo: "fluke" },
  { id: "aurora", nome: "Verde para verde-claro", regra: "Livre", grupo: "fluke" },
  { id: "pilula", nome: "A pílula", regra: "Nível 3", grupo: "fluke" },
  { id: "fibra", nome: "Fibra Óptica", regra: "Nível 5", grupo: "fluke" },
  { id: "torre", nome: "Torre de Sinal", regra: "Nível 10", grupo: "fluke" },
  { id: "aparelhos", nome: "Plataforma", regra: "Nível 15", grupo: "fluke" },
  { id: "chip", nome: "Chip", regra: "Nível 20", grupo: "fluke" },
  { id: "podio", nome: "Pódio", regra: "Ficar no Top 3 de uma quinzena", grupo: "fluke" },
  { id: "fluker", nome: "FLUKER", regra: "Ganhar a FLUKER", grupo: "fluke" },
  { id: "carnaval", nome: "Carnaval", regra: "fevereiro", grupo: "sazonal", mes: 2 },
  { id: "junina", nome: "Festa Junina", regra: "junho", grupo: "sazonal", mes: 6 },
  { id: "cliente", nome: "Dia do Cliente", regra: "setembro", grupo: "sazonal", mes: 9 },
  { id: "bruxas", nome: "Noite das Bruxas", regra: "outubro", grupo: "sazonal", mes: 10 },
  {
    id: "rosa",
    nome: "Outubro Rosa",
    regra: "Solidária · outubro",
    grupo: "sazonal",
    mes: 10,
    solidaria: true,
  },
  {
    id: "azul",
    nome: "Novembro Azul",
    regra: "Solidária · novembro",
    grupo: "sazonal",
    mes: 11,
    solidaria: true,
  },
  { id: "black", nome: "Black Friday", regra: "novembro", grupo: "sazonal", mes: 11 },
  { id: "fimdeano", nome: "Fim de ano", regra: "dezembro", grupo: "sazonal", mes: 12 },
];

export const MOLDURAS: ItemDaAparencia[] = [
  { id: "nenhuma", nome: "Sem moldura", regra: "", grupo: "fluke" },
  { id: "verde", nome: "Verde Fluke", regra: "Nível 2", grupo: "fluke" },
  { id: "prata", nome: "Prata", regra: "Nível 5", grupo: "fluke" },
  { id: "ouro", nome: "Ouro", regra: "Nível 10", grupo: "fluke" },
  { id: "lendaria", nome: "Lendária", regra: "Ter uma conquista lendária", grupo: "fluke" },
  { id: "fluker", nome: "FLUKER", regra: "Ganhar a FLUKER", grupo: "fluke" },
  { id: "bruxas", nome: "Noite das Bruxas", regra: "outubro", grupo: "sazonal", mes: 10 },
];

export const MESES = [
  "",
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** As temporadas deste mês: as capas (e a moldura, se houver). */
export function temporadaDoMes(mes: number): {
  capas: ItemDaAparencia[];
  moldura: ItemDaAparencia | null;
} {
  return {
    capas: CAPAS.filter((c) => c.mes === mes),
    moldura: MOLDURAS.find((m) => m.mes === mes) ?? null,
  };
}

export type MinhaAparencia = {
  capa: string;
  moldura: string;
  capa_da_temporada: boolean;
  moldura_da_temporada: boolean;
  capa_temporada_preferida: string | null;
  mes: number;
  nivel: number;
  capas_liberadas: string[];
  molduras_liberadas: string[];
};

/** A capa e a moldura que valem AGORA (a da temporada, se a pessoa quiser e houver uma). */
export function aparenciaDeAgora(a: MinhaAparencia): { capa: string; moldura: string } {
  const { capas, moldura } = temporadaDoMes(a.mes);
  const capaDaTemporada =
    capas.find((c) => c.id === a.capa_temporada_preferida)?.id ?? capas[0]?.id;
  return {
    capa: a.capa_da_temporada && capaDaTemporada ? capaDaTemporada : a.capa,
    moldura: a.moldura_da_temporada && moldura ? moldura.id : a.moldura,
  };
}

// ---------- O "Quase lá": as conquistas mais perto de serem ganhas ----------
export type QuaseLa = { numero: number; atual: number; alvo: number; unidade: string };
/**
 * As candidatas, com o progresso conhecido: as quinzenas com 100 (53, 54, 55), as quinzenas
 * avaliadas (35, 36, 42) e as Centrais de Comando (as conquistas da dimensão). As 3 com a
 * maior fração (e que ainda não foram ganhas) entram.
 */
export function quaseLa(entrada: {
  ganhas: Set<number>;
  quinzenasCom100: number;
  quinzenasAvaliadas: number;
  centrais: { numero: number; ganhas: number; total: number }[];
}): QuaseLa[] {
  const c: QuaseLa[] = [
    { numero: 53, atual: entrada.quinzenasCom100, alvo: 1, unidade: "quinzena com 100" },
    { numero: 54, atual: entrada.quinzenasCom100, alvo: 5, unidade: "quinzenas com 100" },
    { numero: 55, atual: entrada.quinzenasCom100, alvo: 10, unidade: "quinzenas com 100" },
    { numero: 35, atual: entrada.quinzenasAvaliadas, alvo: 1, unidade: "quinzena avaliada" },
    { numero: 36, atual: entrada.quinzenasAvaliadas, alvo: 3, unidade: "quinzenas avaliadas" },
    { numero: 42, atual: entrada.quinzenasAvaliadas, alvo: 10, unidade: "quinzenas avaliadas" },
    ...entrada.centrais.map((x) => ({
      numero: x.numero,
      atual: x.ganhas,
      alvo: x.total,
      unidade: "conquistas",
    })),
  ];
  return c
    .filter((x) => !entrada.ganhas.has(x.numero) && x.alvo > 0 && x.atual < x.alvo)
    .sort((a, b) => b.atual / b.alvo - a.atual / a.alvo || a.alvo - a.atual - (b.alvo - b.atual)) // no empate, a que falta menos
    .slice(0, 3);
}
/** O texto do que falta ("Falta só mais 1 quinzena com 100!"). */
export function quantoFalta(x: QuaseLa): string {
  const falta = x.alvo - x.atual;
  const unidade = x.unidade
    .replace(/^quinzenas/, falta === 1 ? "quinzena" : "quinzenas")
    .replace(/^conquistas/, falta === 1 ? "conquista" : "conquistas");
  return falta === 1 ? `Falta só mais 1 ${unidade}!` : `Faltam ${falta} ${unidade}.`;
}
