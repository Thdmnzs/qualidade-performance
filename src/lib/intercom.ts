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
  tags?: { tags?: { name?: string | null }[] | null } | null;
  created_at?: number | null;
  title?: string | null;
  state?: string | null;
  source?: (Parte & { subject?: string | null; type?: string | null }) | null;
  conversation_parts?: { conversation_parts?: Parte[] | null } | null;
};

export type Mensagem = {
  autor: "cliente" | "atendente" | "nota" | "bot";
  nome: string | null;
  quando: number | null;
  texto: string;
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
 * Os cinco campos principais sempre aparecem, na ordem do Intercom, com null
 * quando não foram preenchidos (é isso que o avaliador precisa enxergar).
 * Outros atributos preenchidos vêm depois, em ordem alfabética.
 */
export function atributosDaConversa(c: ConversaIntercom): Atributo[] {
  const ca = c.custom_attributes ?? {};
  const principais: Atributo[] = ATRIBUTOS_PRINCIPAIS.map((nome) => ({
    nome,
    valor: valorDoAtributo(ca[nome]),
  }));
  const outros = Object.keys(ca)
    .filter((k) => !(ATRIBUTOS_PRINCIPAIS as readonly string[]).includes(k))
    .map((nome) => ({ nome, valor: valorDoAtributo(ca[nome]) }))
    .filter((a) => a.valor !== null)
    .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
  return [...principais, ...outros];
}

export function tagsDaConversa(c: ConversaIntercom): string[] {
  return (c.tags?.tags ?? []).map((t) => t.name?.trim() ?? "").filter(Boolean);
}
