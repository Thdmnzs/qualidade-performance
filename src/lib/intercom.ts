/**
 * Ligação entre os atendentes do Intercom e os cadastros da plataforma.
 * A chave é o e-mail, comparado sem diferença de maiúsculas e sem espaços.
 */
export type Atendente = { id?: string | number; name?: string | null; email?: string | null };
export type Cadastro = { id: string; nome: string; email: string | null };

export const normalizarEmailIntercom = (e?: string | null) => (e ?? "").trim().toLowerCase();

export type Cruzamento = {
  ligados: { atendente: Atendente; cadastro: Cadastro }[];
  /** No Intercom, sem cadastro aqui: não recebem avaliações sorteadas. */
  semCadastro: Atendente[];
  /** Cadastrados aqui, sem conta (ou com outro e-mail) no Intercom. */
  semIntercom: Cadastro[];
};

export function cruzarAtendentes(atendentes: Atendente[], cadastros: Cadastro[]): Cruzamento {
  const porEmail = new Map(
    cadastros
      .filter((c) => normalizarEmailIntercom(c.email))
      .map((c) => [normalizarEmailIntercom(c.email), c]),
  );
  const comEmail = atendentes.filter((a) => normalizarEmailIntercom(a.email));
  const emailsIntercom = new Set(comEmail.map((a) => normalizarEmailIntercom(a.email)));

  const ligados: Cruzamento["ligados"] = [];
  const semCadastro: Atendente[] = [];
  for (const a of comEmail) {
    const c = porEmail.get(normalizarEmailIntercom(a.email));
    if (c) ligados.push({ atendente: a, cadastro: c });
    else semCadastro.push(a);
  }
  const semIntercom = cadastros.filter(
    (c) => !emailsIntercom.has(normalizarEmailIntercom(c.email)),
  );
  return { ligados, semCadastro, semIntercom };
}

/* ======================= Conversas ======================= */

/** Número da conversa a partir de um link do Intercom ou do próprio número. */
export function extrairIdDaConversa(texto: string): string | null {
  const t = texto.trim();
  if (/^\d+$/.test(t)) return t;
  const m = t.match(/\/conversations?\/(\d+)/);
  return m ? m[1]! : null;
}

/** Link canônico da conversa (o mesmo formato sempre, para a proteção contra duplicidade funcionar). */
export const linkDaConversa = (appId: string, id: string) =>
  `https://app.intercom.com/a/inbox/${appId}/inbox/conversation/${id}`;

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
};

/**
 * HTML do Intercom em TEXTO PURO. A tela nunca interpreta HTML vindo de fora:
 * uma mensagem com <script> ou <img onerror> vira texto inofensivo (proteção contra XSS).
 */
export function htmlParaTexto(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*img[^>]*>/gi, "[imagem]")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#39|[a-z]+);/gi, (inteira, nome: string) => {
      if (/^#\d+$/.test(nome)) return String.fromCodePoint(Number(nome.slice(1)));
      return ENTIDADES[nome.toLowerCase()] ?? inteira;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Autor = { type?: string | null; id?: string | number | null; name?: string | null };
type Parte = {
  part_type?: string | null;
  body?: string | null;
  created_at?: number | null;
  author?: Autor | null;
};
export type ConversaIntercom = {
  id: string | number;
  /** Atributos personalizados (Natureza, Assunto, Detalhe, Jornada, Conclusão...). */
  custom_attributes?: Record<string, unknown> | null;
  created_at?: number | null;
  title?: string | null;
  state?: string | null;
  /** A origem: o tipo (conversation, email, whatsapp...) e, no chat do site, a página onde começou. */
  source?: (Parte & { subject?: string | null; type?: string | null; url?: string | null }) | null;
  conversation_parts?: { conversation_parts?: Parte[] | null } | null;
  /** O cliente (o "lead") da conversa: é por ele que o Intercom entrega as notas do contato. */
  contacts?: { contacts?: { id: string | number }[] | null } | null;
};

export type Mensagem = {
  autor: "cliente" | "atendente" | "nota" | "bot";
  nome: string | null;
  quando: number | null;
  texto: string;
  /** Quem escreveu, no Intercom (22/10/2026): para separar os atendentes de uma conversa com vários. */
  autorId?: string | null;
  /** A mensagem é do atendente que está sendo avaliado? (marcada pela busca, quando ela sabe quem é) */
  doAvaliado?: boolean;
};

const tipoDoAutor = (
  a: Autor | null | undefined,
  parte: string | null | undefined,
): Mensagem["autor"] => {
  if (parte === "note") return "nota";
  if (a?.type === "admin") return "atendente";
  if (a?.type === "bot") return "bot";
  return "cliente";
};

/** Transcrição em texto: a primeira mensagem, as respostas e as notas internas (eventos do sistema ficam de fora). */
export function montarTranscricao(c: ConversaIntercom): Mensagem[] {
  const msgs: Mensagem[] = [];
  const primeira = htmlParaTexto(c.source?.body);
  if (primeira) {
    msgs.push({
      autor: tipoDoAutor(c.source?.author, null),
      nome: c.source?.author?.name ?? null,
      quando: c.created_at ?? null,
      texto: primeira,
      autorId: c.source?.author?.id != null ? String(c.source.author.id) : null,
    });
  }
  for (const p of c.conversation_parts?.conversation_parts ?? []) {
    if (p.part_type !== "comment" && p.part_type !== "note") continue;
    const texto = htmlParaTexto(p.body);
    if (!texto) continue;
    msgs.push({
      autor: tipoDoAutor(p.author, p.part_type),
      nome: p.author?.name ?? null,
      quando: p.created_at ?? null,
      texto,
      autorId: p.author?.id != null ? String(p.author.id) : null,
    });
  }
  return msgs;
}

/** O atendente escreveu de fato na conversa (e não só recebeu a atribuição)? */
export function atendenteEscreveu(c: ConversaIntercom, adminId: string | number): boolean {
  const id = String(adminId);
  const escreveu = (p: Parte | null | undefined) =>
    p?.author?.type === "admin" && String(p.author.id) === id && !!htmlParaTexto(p.body);
  return (
    escreveu(c.source) ||
    (c.conversation_parts?.conversation_parts ?? []).some(
      (p) => p.part_type === "comment" && escreveu(p),
    )
  );
}

/** Sorteio justo entre os candidatos que ainda não foram usados. `aleatorio` devolve um número em [0, 1). */
export function escolherAleatorio<T extends string>(
  ids: T[],
  excluir: Set<string>,
  aleatorio: () => number,
): T | null {
  const candidatos = [...new Set(ids)].filter((id) => !excluir.has(id));
  if (candidatos.length === 0) return null;
  return candidatos[Math.min(candidatos.length - 1, Math.floor(aleatorio() * candidatos.length))]!;
}

/** Data do contato (AAAA-MM-DD) no fuso de Fortaleza, a partir do horário do Intercom (segundos). */
export const dataDoContato = (unix: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unix * 1000));

/** Assunto sugerido: o título da conversa ou o assunto do e-mail. O avaliador pode ajustar. */
export function assuntoSugerido(c: ConversaIntercom): string | null {
  const ca = c.custom_attributes ?? {};
  const t =
    htmlParaTexto(c.title) ||
    htmlParaTexto(c.source?.subject) ||
    valorDoAtributoTexto(ca["Detalhe"]) ||
    valorDoAtributoTexto(ca["Assunto"]);
  return t ? t.slice(0, 200) : null;
}

const valorDoAtributoTexto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/* ======================= Links seguros ======================= */

/** Endereços oficiais da caixa de entrada do Intercom (EUA, Europa e Austrália). */
const HOSTS_DO_INTERCOM = new Set([
  "app.intercom.com",
  "app.eu.intercom.com",
  "app.au.intercom.com",
]);

/**
 * Só aceita links que apontam DE FATO para o Intercom. Qualquer outro endereço
 * (inclusive disfarçado, como "app.intercom.com.golpe.io") volta null, e a tela
 * o mostra como texto, sem clique. Assim, um link digitado à mão nunca leva
 * ninguém para fora do Intercom a partir da plataforma.
 */
export function linkSeguroDoIntercom(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  return HOSTS_DO_INTERCOM.has(u.hostname.toLowerCase()) ? u.toString() : null;
}

/* ======================= Classificação do atendimento ======================= */

/** Campos de classificação que o time preenche em toda conversa (critério 14 da ficha). */
export const ATRIBUTOS_PRINCIPAIS = [
  "Natureza",
  "Assunto",
  "Detalhe",
  "Jornada",
  "Conclusão",
] as const;

export type Atributo = { nome: string; valor: string | null };

const valorDoAtributo = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.trim() || null;
  return null; // objetos e listas não são classificação
};

/**
 * SÓ os cinco campos de classificação, sempre na mesma ordem, com null quando
 * não preenchidos. Os demais atributos da conversa ficam de fora DE PROPÓSITO:
 * alguns trazem dados do cliente (como o "Resumo do Cliente", com CPF e e-mail),
 * que a avaliação não precisa (LGPD, art. 6º, III: minimização).
 */
export function atributosDaConversa(c: ConversaIntercom): Atributo[] {
  const ca = c.custom_attributes ?? {};
  return ATRIBUTOS_PRINCIPAIS.map((nome) => ({ nome, valor: valorDoAtributo(ca[nome]) }));
}

/**
 * Texto usado para sugerir o processo da Flukepédia: o assunto, os campos
 * Assunto e Detalhe da classificação e a primeira mensagem do cliente.
 */
export function textoParaSugerirProcesso(c: {
  assunto: string | null;
  atributos: Atributo[];
  mensagens: Mensagem[];
}): string {
  const atributo = (nome: string) => c.atributos.find((a) => a.nome === nome)?.valor ?? "";
  const primeiraDoCliente = c.mensagens.find((m) => m.autor === "cliente")?.texto ?? "";
  return [
    c.assunto ?? "",
    atributo("Assunto"),
    atributo("Detalhe"),
    primeiraDoCliente.slice(0, 300),
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ======================= As notas do lead (20/10/2026) ======================= */

/** Um pedaço de uma linha de uma nota: um texto, ou um link seguro (http ou https). */
export type PedacoDaNota = { texto: string; url?: string };
/** Uma nota do contato no Intercom (as "Notas do lead"), com o texto em linhas e os links preservados. */
export type NotaDoLead = {
  id: string;
  autor: string | null;
  quando: number | null;
  linhas: PedacoDaNota[][];
};
export type NotaDoIntercom = {
  id: string | number;
  body?: string | null;
  created_at?: number | null;
  author?: { name?: string | null } | null;
};

const MARCA = "\u0000";
/**
 * O HTML de uma nota em linhas, com os links (20/10/2026). Os links seguros viram pedaços com o endereço; todo
 * o resto do HTML vira texto puro (pela mesma função das mensagens), então nada vindo do Intercom vira código.
 */
export function linhasDaNota(html: string | null | undefined): PedacoDaNota[][] {
  if (!html) return [];
  const links: PedacoDaNota[] = [];
  const marcado = html.replace(
    /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_, __, href: string, miolo: string) => {
      const url = htmlParaTexto(href).trim();
      const texto = htmlParaTexto(miolo).trim() || url;
      if (!/^https?:\/\//i.test(url)) return texto; // um endereço que não é http(s) vira só o texto
      links.push({ texto, url });
      return `${MARCA}${links.length - 1}${MARCA}`;
    },
  );
  return (
    htmlParaTexto(marcado)
      .split("\n")
      .map((linha) => {
        const pedacos: PedacoDaNota[] = [];
        linha.split(new RegExp(`${MARCA}(\\d+)${MARCA}`)).forEach((t, i) => {
          if (i % 2) pedacos.push(links[Number(t)]!);
          else if (t) pedacos.push({ texto: t });
        });
        return pedacos;
      })
      // Uma linha só com pontuação (como a nota "." do Intercom) não diz nada, e sai.
      .filter((l) => l.some((p) => p.url || /[\p{L}\p{N}]/u.test(p.texto)))
  );
}

/** As notas do Intercom, da mais nova para a mais antiga (como na barra do Intercom). */
export function notasDoLead(notas: NotaDoIntercom[] | null | undefined): NotaDoLead[] {
  return [...(notas ?? [])]
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
    .map((n) => ({
      id: String(n.id),
      autor: n.author?.name ?? null,
      quando: n.created_at ?? null,
      linhas: linhasDaNota(n.body),
    }))
    .filter((n) => n.linhas.length > 0);
}

/* ============ Os contatos com vários atendentes (22/10/2026) ============ */

export type AtendenteDaConversa = {
  id: string;
  nome: string;
  avaliado: boolean;
  mensagens: number;
};

/**
 * A regra da qualidade: num contato com vários atendentes, cada um é avaliado SEPARADAMENTE, só pela parte dele.
 * Marca as mensagens do atendente avaliado (as respostas dele, e não as notas internas), e lista os atendentes que
 * escreveram na conversa, na ordem em que apareceram.
 */
export function separarAtendentes(
  mensagens: Mensagem[],
  avaliadoId: string | null,
): { mensagens: Mensagem[]; atendentes: AtendenteDaConversa[] } {
  const atendentes = new Map<string, AtendenteDaConversa>();
  const marcadas = mensagens.map((m) => {
    if (m.autor !== "atendente" || !m.autorId) return { ...m, doAvaliado: false };
    const avaliado = !!avaliadoId && m.autorId === avaliadoId;
    const a = atendentes.get(m.autorId) ?? {
      id: m.autorId,
      nome: m.nome ?? "Atendente",
      avaliado,
      mensagens: 0,
    };
    a.mensagens++;
    atendentes.set(m.autorId, a);
    return { ...m, doAvaliado: avaliado };
  });
  return { mensagens: marcadas, atendentes: [...atendentes.values()] };
}
