/**
 * Tickets de back-office do Intercom (07/10/2026): o sorteio para a avaliação
 * do tipo "Ticket de back-office" (no banco, o tipo continua `ticket_n2`).
 *
 *   - Entram os tipos dos núcleos [cxtech], [rede], [fraude e risco],
 *     [logística] e [financeiro], pelo nome entre colchetes: um tipo novo de
 *     um desses núcleos entra sozinho. Ficam de fora [leads] e "teste [automação]".
 *   - Quem é avaliado é quem CRIOU o ticket: o atendente autor do primeiro
 *     registro do histórico (o envio ao núcleo, ou a conversa vinculada), como
 *     no Intercom ("Conversa ... vinculada por Rubia", "Foi mudado para
 *     'Submitted' por Rubia"). Clientes, robôs e fluxos de trabalho não contam.
 *     Sem um atendente identificado com segurança, o ticket fica FORA do
 *     sorteio (nunca se sorteia o ticket de outra pessoa).
 * Puro (sem rede), para ser testado à parte.
 */
import { htmlParaTexto, type Atributo, type Mensagem } from "@/lib/intercom";

export type AutorIntercom = {
  type?: string | null;
  id?: string | number | null;
  name?: string | null;
};
export type ParteDoTicket = {
  part_type?: string | null;
  body?: string | null;
  author?: AutorIntercom | null;
  created_at?: number | null;
  ticket_state?: string | null;
};
export type TicketIntercom = {
  id: string | number;
  ticket_id?: string | number | null;
  ticket_type?: { id?: string | number; name?: string | null } | null;
  ticket_attributes?: Record<string, unknown> | null;
  ticket_state?: { category?: string | null; internal_label?: string | null } | string | null;
  created_at?: number | null;
  linked_objects?: { data?: { type?: string | null; id?: string | number | null }[] | null } | null;
  ticket_parts?: { ticket_parts?: ParteDoTicket[] | null } | null;
};
export type TipoDeTicket = { id: string | number; name?: string | null; archived?: boolean | null };

const NUCLEOS = new Set(["cxtech", "rede", "fraude e risco", "logistica", "financeiro"]);

export type Nucleo = "cxtech" | "rede" | "fraude e risco" | "logistica" | "financeiro";

/**
 * Quem avalia os tickets de cada núcleo (reunião de 07/10/2026), pelo E-MAIL, que
 * não se repete nem muda (o nome, sim: a Fran está cadastrada como "Franciele").
 * O ADM sorteia de qualquer núcleo. Uma avaliadora fora da tabela não recebe
 * tickets até ser incluída aqui.
 */
export const NUCLEOS_POR_AVALIADOR: Record<string, Nucleo[]> = {
  "rachel@flukeoperadora.com.br": ["cxtech", "logistica", "fraude e risco", "financeiro"],
  "fran@flukeoperadora.com.br": ["rede", "logistica", "fraude e risco", "financeiro"],
};

export const ROTULO_DO_NUCLEO: Record<Nucleo, string> = {
  cxtech: "CX Tech",
  rede: "Rede",
  logistica: "Logística",
  "fraude e risco": "Fraude e Risco",
  financeiro: "Financeiro",
};

/** Os núcleos de quem sorteia: todos para o ADM; os da tabela para a avaliadora; nenhum fora dela. */
export function nucleosDe(email: string | null | undefined, ehAdm: boolean): Nucleo[] {
  if (ehAdm) return [...NUCLEOS] as Nucleo[];
  return NUCLEOS_POR_AVALIADOR[normalizar(email)] ?? [];
}

/** O núcleo de um tipo de ticket ("[rede] portabilidade" → "rede"), ou null. */
export function nucleoDoTipo(nome: string | null | undefined): Nucleo | null {
  const m = normalizar(nome).match(/^\[([^\]]+)\]/);
  const n = m?.[1]?.trim();
  return n && NUCLEOS.has(n) ? (n as Nucleo) : null;
}
const normalizar = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** O tipo entra no sorteio? Pelo núcleo entre colchetes no começo do nome. */
export function tipoEntraNoSorteio(nome: string | null | undefined, nucleos?: Nucleo[]): boolean {
  const n = nucleoDoTipo(nome);
  return !!n && (!nucleos || nucleos.includes(n));
}

const partes = (t: TicketIntercom) =>
  [...(t.ticket_parts?.ticket_parts ?? [])].sort(
    (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0),
  );

/** Quem criou o ticket: o atendente autor do primeiro registro, ou null. */
export function criadorDoTicket(t: TicketIntercom): { id: string; nome: string | null } | null {
  const primeiro = partes(t).find((p) => p.author?.type === "admin" && p.author.id != null);
  return primeiro ? { id: String(primeiro.author!.id), nome: primeiro.author!.name ?? null } : null;
}

const ESTADOS: Record<string, string> = {
  submitted: "enviado",
  in_progress: "em andamento",
  waiting_on_customer: "aguardando o cliente",
  resolved: "resolvido",
};
export function estadoDoTicket(t: TicketIntercom): string | null {
  const e = t.ticket_state;
  const chave = typeof e === "string" ? e : (e?.category ?? null);
  if (!chave) return typeof e === "object" ? (e?.internal_label ?? null) : null;
  return (
    ESTADOS[normalizar(chave)] ?? (typeof e === "object" ? (e?.internal_label ?? chave) : chave)
  );
}

export const tituloDoTicket = (t: TicketIntercom) =>
  htmlParaTexto(String(t.ticket_attributes?.["_default_title_"] ?? "")).trim() ||
  (t.ticket_type?.name ?? "Ticket");

/** O valor de um campo, como texto (anexos viram "1 anexo"; vazio vira null). */
function valorDoCampo(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "string" || typeof v === "number")
    return htmlParaTexto(String(v)).trim() || null;
  if (Array.isArray(v))
    return v.length ? `${v.length} ${v.length === 1 ? "anexo" : "anexos"}` : null;
  if (typeof v === "object" && v && "url" in v) return "1 anexo";
  return null;
}

/** Os campos preenchidos (ou não) do ticket, sem o título e a descrição padrão. */
export function camposDoTicket(t: TicketIntercom): Atributo[] {
  return Object.entries(t.ticket_attributes ?? {})
    .filter(([nome]) => !nome.startsWith("_default_"))
    .map(([nome, v]) => ({ nome, valor: valorDoCampo(v) }));
}

const AUTOR: Record<string, Mensagem["autor"]> = {
  admin: "atendente",
  user: "cliente",
  lead: "cliente",
  contact: "cliente",
  bot: "bot",
};

/** Comentários e notas internas, como mensagens (texto puro). */
export function mensagensDoTicket(t: TicketIntercom): Mensagem[] {
  return partes(t)
    .filter((p) => htmlParaTexto(p.body).trim())
    .map((p) => ({
      autor: p.part_type === "note" ? "nota" : (AUTOR[p.author?.type ?? ""] ?? "bot"),
      nome: p.author?.name ?? null,
      quando: p.created_at ?? null,
      texto: htmlParaTexto(p.body).trim(),
    }));
}

// Os registros mais comuns do histórico, em português (o nome técnico fica como último recurso).
const ACOES: Record<string, string> = {
  conversation_linked: "vinculou a conversa com o cliente",
  linked_conversation: "vinculou a conversa com o cliente",
  assignment: "atribuiu o ticket",
  ticket_attribute_updated_by_admin: "atualizou um campo",
  ticket_attribute_updated_by_workflow: "atualizou um campo",
  open: "reabriu o ticket",
  close: "fechou o ticket",
};

/** Os eventos do histórico (sem texto): quem fez o quê, e quando. */
export function historicoDoTicket(t: TicketIntercom): { quando: number | null; texto: string }[] {
  return partes(t)
    .filter((p) => !htmlParaTexto(p.body).trim())
    .map((p) => {
      const quem = p.author?.type === "bot" ? "Fluxo de trabalho" : (p.author?.name ?? "Alguém");
      const acao = p.ticket_state
        ? `mudou para "${ESTADOS[normalizar(p.ticket_state)] ?? p.ticket_state}"`
        : (ACOES[String(p.part_type ?? "")] ??
          String(p.part_type ?? "registro").replace(/_/g, " "));
      return { quando: p.created_at ?? null, texto: `${quem}: ${acao}` };
    });
}

/** O número da conversa de onde o ticket saiu, se houver. */
export const conversaDeOrigem = (t: TicketIntercom): string | null => {
  const c = (t.linked_objects?.data ?? []).find((o) => o.type === "conversation" && o.id != null);
  return c ? String(c.id) : null;
};

/** O assunto sugerido: o tipo e, se houver, o "Tipo de solicitação" (até 200 caracteres). */
export function assuntoDoTicket(t: TicketIntercom): string {
  const tipo = t.ticket_type?.name ?? "Ticket de back-office";
  const solicitacao = camposDoTicket(t).find(
    (c) => normalizar(c.nome) === "tipo de solicitacao",
  )?.valor;
  return `${tipo}${solicitacao ? ` · ${solicitacao}` : ""}`.slice(0, 200);
}
