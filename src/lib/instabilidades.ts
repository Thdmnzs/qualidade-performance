/**
 * As instabilidades (20/10/2026): os avisos do canal #instabilidade (do Statuspage, como o do Pagar.me) lidos e
 * agrupados por incidente. Puro, para testes. As mensagens de pessoas viram avisos simples (com a conversa).
 */
export type Gravidade = "major" | "partial" | "degraded" | "manutencao" | "ok";
export type Aviso = {
  tipo: "incidente" | "manutencao";
  etapa: string; // em português ("Identificado", "Resolvido"...)
  encerra: boolean; // a etapa encerra o incidente (resolvido, concluída)
  emAndamento: boolean; // uma manutenção em andamento
  gravidade: Gravidade | null;
  titulo: string | null;
  url: string | null;
  sistema: string | null;
  corpo: string;
  janela: { de: string; ate: string } | null; // a janela de uma manutenção (ISO)
};
export type Mensagem = {
  ts: string;
  autor_nome: string | null;
  texto: string;
  respostas: unknown[];
  criado_em: string;
};
export type Etapa = { quando: string; etapa: string; gravidade: Gravidade | null; corpo: string };
export type Incidente = {
  chave: string;
  tipo: "incidente" | "manutencao";
  fonte: string | null;
  titulo: string;
  url: string | null;
  sistema: string | null;
  etapas: Etapa[];
  etapaAtual: string;
  gravidade: Gravidade | null;
  inicio: string;
  fim: string | null; // quando foi resolvido (ou concluída)
  janela: { de: string; ate: string } | null;
  emAndamento: boolean;
};

const ETAPAS: Record<string, [string, boolean]> = {
  investigating: ["Investigando", false],
  identified: ["Identificado", false],
  monitoring: ["Monitorando", false],
  verifying: ["Verificando", false],
  update: ["Atualização", false],
  resolved: ["Resolvido", true],
  postmortem: ["Análise pós-incidente", true],
  scheduled: ["Agendada", false],
  "in progress": ["Em andamento", false],
  completed: ["Concluída", true],
  cancelled: ["Cancelada", true],
};
const SITUACOES: Record<string, Gravidade> = {
  major_outage: "major",
  partial_outage: "partial",
  degraded_performance: "degraded",
  under_maintenance: "manutencao",
  operational: "ok",
};
const PESO: Record<Gravidade, number> = { major: 4, partial: 3, degraded: 2, manutencao: 1, ok: 0 };
const pior = (a: Gravidade | null, b: Gravidade) => (!a || PESO[b] > PESO[a] ? b : a);
const MESES: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};
/** "22 Oct 2026 03:00 -03" → o ISO. */
function dataDoStatuspage(t: string): string | null {
  const m = t.match(
    /(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})\s+(\d{2}):(\d{2})\s*([+-]\d{2})(?::?(\d{2}))?/,
  );
  if (!m || !MESES[m[2]!.toLowerCase()]) return null;
  return new Date(
    `${m[3]}-${MESES[m[2]!.toLowerCase()]}-${m[1]!.padStart(2, "0")}T${m[4]}:${m[5]}:00${m[6]}:${m[7] ?? "00"}`,
  ).toISOString();
}
const LIXO =
  /^(bot[aã]o\b|view all updates|<https?:\/\/[^>]*\|powered by|https?:\/\/\S+\.(png|jpe?g|gif|svg)\s*$)/i;

/** Um aviso automático (Statuspage), ou null se a mensagem é de uma pessoa (ou não segue o padrão). */
export function lerAviso(texto: string): Aviso | null {
  const linhas = texto.split("\n").map((l) => l.trim());
  const cab = linhas.findIndex((l) => /^\*?(incident|maintenance)\s*:\s*[^*]+\*?$/i.test(l));
  if (cab < 0) return null;
  const [, tipoIng, etapaIng] = linhas[cab]!.match(
    /^\*?(incident|maintenance)\s*:\s*([^*]+?)\*?$/i,
  )!;
  const [etapa, encerra] = ETAPAS[etapaIng!.trim().toLowerCase()] ?? [etapaIng!.trim(), false];
  let titulo: string | null = null;
  let url: string | null = null;
  let gravidade: Gravidade | null = null;
  let sistema: string | null = null;
  let janela: Aviso["janela"] = null;
  const corpo: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]!;
    if (i === cab || !l || LIXO.test(l)) continue;
    const link = l.match(/^\*<(https?:\/\/[^|>]+)\|([^>]+)>\*$/);
    if (link && !titulo) {
      url = link[1]!;
      titulo = link[2]!;
      continue;
    }
    const situacao = SITUACOES[l.toLowerCase()];
    if (situacao) {
      gravidade = pior(gravidade, situacao);
      // A linha seguinte (que não é uma imagem) é o sistema: "Transacional - Transacional - PIX" vira "Transacional - PIX".
      let k = i + 1;
      while (k < linhas.length && LIXO.test(linhas[k]!)) k++;
      const nome = linhas[k];
      if (nome && !SITUACOES[nome.toLowerCase()] && !/^\*/.test(nome)) {
        const partes = nome.split(" - ");
        const limpo =
          partes.length > 2 && partes[0] === partes[1] ? partes.slice(1).join(" - ") : nome;
        if (!sistema && situacao !== "ok") sistema = limpo;
        else if (!sistema) sistema = limpo;
        i = k;
      }
      continue;
    }
    if (/^\*duration\*$/i.test(l)) {
      const [de, ate] = (linhas[i + 1] ?? "").split(/\s+to\s+/i);
      const d = de ? dataDoStatuspage(de) : null;
      const a = ate ? dataDoStatuspage(ate) : null;
      if (d && a) janela = { de: d, ate: a };
      i++;
      continue;
    }
    if (/\|\s*<https?:\/\/[^>]*unsubscribe/i.test(l) || /unsubscribe/i.test(l)) continue;
    corpo.push(l);
  }
  const tipo = tipoIng!.toLowerCase() === "maintenance" ? "manutencao" : "incidente";
  return {
    tipo,
    etapa,
    encerra,
    emAndamento: tipo === "manutencao" && etapa === "Em andamento",
    gravidade,
    titulo,
    url,
    sistema,
    corpo: corpo.join("\n"),
    janela,
  };
}

const DIAS_DOS_RESOLVIDOS = 7;
/**
 * O quadro: os incidentes (as etapas juntas, pelo endereço no Statuspage), separados em ativos, manutenções
 * por vir, resolvidos nos últimos 7 dias; e as mensagens de pessoas dos últimos 7 dias (os avisos simples).
 */
export function quadroDeInstabilidades(mensagens: Mensagem[], agora = Date.now()) {
  const grupos = new Map<string, Incidente>();
  const pessoas: Mensagem[] = [];
  for (const m of [...mensagens].sort((a, b) => a.criado_em.localeCompare(b.criado_em))) {
    const a = lerAviso(m.texto);
    if (!a) {
      pessoas.push(m);
      continue;
    }
    const chave = a.url ?? `${m.autor_nome}|${a.titulo ?? a.sistema ?? m.ts}`;
    const g = grupos.get(chave) ?? {
      chave,
      tipo: a.tipo,
      fonte: m.autor_nome?.replace(/\s+status$/i, "") ?? null,
      titulo: a.titulo ?? a.sistema ?? "Instabilidade",
      url: a.url,
      sistema: a.sistema,
      etapas: [],
      etapaAtual: a.etapa,
      gravidade: null,
      inicio: m.criado_em,
      fim: null,
      janela: a.janela,
      emAndamento: false,
    };
    g.etapas.push({ quando: m.criado_em, etapa: a.etapa, gravidade: a.gravidade, corpo: a.corpo });
    g.etapaAtual = a.etapa;
    g.sistema = g.sistema ?? a.sistema;
    g.janela = a.janela ?? g.janela;
    g.emAndamento = a.emAndamento;
    // A gravidade de um incidente aberto é a da última etapa que não é "normal" (o pior momento conhecido).
    if (a.gravidade && a.gravidade !== "ok") g.gravidade = a.gravidade;
    g.fim = a.encerra ? m.criado_em : null;
    grupos.set(chave, g);
  }
  const todos = [...grupos.values()];
  const limite = agora - DIAS_DOS_RESOLVIDOS * 86_400_000;
  const porMaisNovo = (a: Incidente, b: Incidente) => b.inicio.localeCompare(a.inicio);
  return {
    ativos: todos.filter((i) => i.tipo === "incidente" && !i.fim).sort(porMaisNovo),
    manutencoes: todos
      .filter(
        (i) =>
          i.tipo === "manutencao" &&
          !i.fim &&
          (!i.janela || new Date(i.janela.ate).getTime() > agora),
      )
      .sort((a, b) => (a.janela?.de ?? a.inicio).localeCompare(b.janela?.de ?? b.inicio)),
    resolvidos: todos
      .filter((i) => i.tipo === "incidente" && i.fim && new Date(i.fim).getTime() >= limite)
      .sort(porMaisNovo),
    pessoas: pessoas.filter((m) => new Date(m.criado_em).getTime() >= limite).reverse(),
  };
}

/**
 * O período que o PRÓPRIO aviso informa (23/10/2026): o Statuspage costuma escrever, no aviso de resolvido, "Entre
 * 00:54 e 01:35 passamos por uma instabilidade". Esse é o horário real (o do aviso é só quando ele foi publicado).
 */
export function periodoInformado(texto: string): { de: string; ate: string } | null {
  const m = texto.match(
    /entre\s+(?:as\s+|às\s+)?(\d{1,2})\s*[:h]\s*(\d{2})\s*(?:h\s*)?e\s+(?:as\s+|às\s+)?(\d{1,2})\s*[:h]\s*(\d{2})/i,
  );
  if (!m) return null;
  const hm = (h: string, mi: string) =>
    Number(h) < 24 && Number(mi) < 60 ? `${h.padStart(2, "0")}:${mi}` : null;
  const de = hm(m[1]!, m[2]!);
  const ate = hm(m[3]!, m[4]!);
  return de && ate ? { de, ate } : null;
}

/** Os minutos entre dois horários ("00:54" a "01:35" = 41), passando da meia-noite se preciso. */
export function minutosEntre(de: string, ate: string): number {
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return (min(ate) - min(de) + 1440) % 1440;
}
