/**
 * O mural do CX e as instabilidades no servidor (20/10/2026): lê os canais #cx_mural e #instabilidade do
 * Slack e guarda as mensagens no banco (a tabela que a Visão geral lê, e que o tempo real empurra).
 *   * Os avisos do Slack (o "Events API"), a cada mensagem, resposta, edição, exclusão ou reação num dos
 *     canais, conferidos pela assinatura secreta (SLACK_SIGNING_SECRET).
 *   * A rede de segurança: a releitura dos canais, quando a última tem mais de 5 minutos.
 * As menções a pessoas (<@U...>) viram o nome, aqui, para a tela não precisar perguntar ao Slack.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const CANAL_DO_MURAL = process.env["SLACK_CANAL_MURAL"] || "C02FDSRANCD"; // o #cx_mural
export const CANAL_DE_INSTABILIDADE = process.env["SLACK_CANAL_INSTABILIDADE"] || "C027Y8CP9U4"; // o #instabilidade (privado)
/** Os canais lidos, e quantos dias de cada (30 no #instabilidade, para não perder um incidente longo ainda aberto). */
const CANAIS: Record<string, number> = { [CANAL_DO_MURAL]: 15, [CANAL_DE_INSTABILIDADE]: 30 };
const token = () => process.env["SLACK_MURAL_TOKEN"] || process.env["SLACK_BOT_TOKEN"];

type Bloco = {
  type: string;
  text?: { text?: string };
  fields?: { text?: string }[];
  elements?: { type?: string; text?: string; alt_text?: string }[];
  alt_text?: string;
};
type Anexo = {
  pretext?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: { title?: string; value?: string }[];
};
type Mensagem = {
  ts: string;
  thread_ts?: string;
  user?: string;
  username?: string;
  bot_profile?: { name?: string };
  text?: string;
  subtype?: string;
  reply_count?: number;
  reactions?: { name: string; count: number }[];
  edited?: { ts: string };
  blocks?: Bloco[];
  attachments?: Anexo[];
};

/** Uma chamada à API do Slack (só leitura). */
async function slack<T>(metodo: string, params: Record<string, string>): Promise<T> {
  const t = token();
  if (!t) throw new Error("sem o token do Slack");
  const r = await fetch(`https://slack.com/api/${metodo}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${t}` },
  });
  const j = (await r.json()) as { ok: boolean; error?: string } & T;
  if (!j.ok) throw new Error(`Slack ${metodo}: ${j.error ?? r.status}`);
  return j;
}

/** A assinatura do Slack (v0): o HMAC do "v0:momento:corpo", e o momento com até 5 minutos. */
export function assinaturaValida(p: {
  corpo: string;
  momento: string | null;
  assinatura: string | null;
  segredo: string;
  agora?: number;
}): boolean {
  if (!p.momento || !p.assinatura || !p.segredo) return false;
  const agora = Math.floor((p.agora ?? Date.now()) / 1000);
  if (!/^\d+$/.test(p.momento) || Math.abs(agora - Number(p.momento)) > 300) return false; // contra a repetição de um aviso antigo
  const esperada = `v0=${createHmac("sha256", p.segredo).update(`v0:${p.momento}:${p.corpo}`).digest("hex")}`;
  const a = Buffer.from(esperada);
  const b = Buffer.from(p.assinatura);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * O texto de uma mensagem (20/10/2026): o texto comum, ou, nos avisos automáticos (como o Statuspage), o que
 * vem nos blocos e nos anexos. As imagens entram pelo texto alternativo (que, no Statuspage, é a situação do
 * sistema, como "major_outage"); os botões ficam de fora. Dos dois, fica o mais completo.
 */
export function textoDaMensagem(m: Pick<Mensagem, "text" | "blocks" | "attachments">): string {
  const linhas: string[] = [];
  for (const b of m.blocks ?? []) {
    if (b.type === "section" || b.type === "header") {
      if (b.text?.text) linhas.push(b.text.text);
      for (const f of b.fields ?? []) if (f.text) linhas.push(f.text);
    } else if (b.type === "context") {
      for (const e of b.elements ?? []) {
        if (e.type === "image" && e.alt_text) linhas.push(e.alt_text);
        else if (e.text) linhas.push(e.text);
      }
    } else if (b.type === "image" && b.alt_text) linhas.push(b.alt_text);
  }
  for (const a of m.attachments ?? []) {
    if (a.pretext) linhas.push(a.pretext);
    if (a.title) linhas.push(a.title_link ? `*<${a.title_link}|${a.title}>*` : `*${a.title}*`);
    if (a.text) linhas.push(a.text);
    for (const f of a.fields ?? [])
      linhas.push([f.title ? `*${f.title}*` : "", f.value ?? ""].filter(Boolean).join("\n"));
  }
  const dosBlocos = linhas.join("\n").trim();
  const comum = (m.text ?? "").trim();
  return dosBlocos.length > comum.length ? dosBlocos : comum;
}

/** Os nomes das pessoas citadas e dos autores (uma consulta por pessoa, por vez). */
async function nomes(ids: Set<string>): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const id of ids) {
    try {
      const { user } = await slack<{
        user: { real_name?: string; profile?: { display_name?: string; real_name?: string } };
      }>("users.info", { user: id });
      const nome =
        user.profile?.display_name || user.profile?.real_name || user.real_name || "alguém";
      mapa.set(
        id,
        nome.split(" ")[0]!.replace(/^./, (c) => c.toUpperCase()),
      );
    } catch {
      mapa.set(id, "alguém");
    }
  }
  return mapa;
}
const pessoasDe = (ms: Mensagem[]) => {
  const ids = new Set<string>();
  for (const m of ms) {
    if (m.user) ids.add(m.user);
    for (const x of textoDaMensagem(m).matchAll(/<@([A-Z0-9]+)>/g)) ids.add(x[1]!);
  }
  return ids;
};
const comNomes = (texto: string, mapa: Map<string, string>) =>
  texto.replace(/<@([A-Z0-9]+)>/g, (_, id: string) => `<@${id}|${mapa.get(id) ?? "alguém"}>`);
const autor = (m: Mensagem, mapa: Map<string, string>) =>
  (m.user ? mapa.get(m.user) : null) ?? m.bot_profile?.name ?? m.username ?? "alguém";
const quando = (ts: string) => new Date(Number(ts.split(".")[0]) * 1000).toISOString();
/** As mensagens que contam (e não as entradas no canal, as saídas, os avisos do próprio Slack). */
const ehComunicado = (m: Mensagem) =>
  !m.subtype ||
  m.subtype === "thread_broadcast" ||
  m.subtype === "bot_message" ||
  m.subtype === "file_share";

/** Uma mensagem com a conversa: lê as respostas e grava a linha. */
async function gravarComunicado(canal: string, m: Mensagem) {
  let respostas: Mensagem[] = [];
  if ((m.reply_count ?? 0) > 0) {
    const r = await slack<{ messages: Mensagem[] }>("conversations.replies", {
      channel: canal,
      ts: m.ts,
      limit: "200",
    });
    respostas = r.messages.filter((x) => x.ts !== m.ts && ehComunicado(x));
  }
  const mapa = await nomes(pessoasDe([m, ...respostas]));
  const { error } = await supabaseAdmin.from("mural_comunicados").upsert({
    canal,
    ts: m.ts,
    autor_nome: autor(m, mapa),
    texto: comNomes(textoDaMensagem(m), mapa).slice(0, 40000),
    respostas: respostas.map((x) => ({
      ts: x.ts,
      autor_nome: autor(x, mapa),
      texto: comNomes(textoDaMensagem(x), mapa).slice(0, 20000),
    })),
    qtd_respostas: respostas.length,
    reacoes_ok: m.reactions?.find((x) => x.name === "white_check_mark")?.count ?? 0,
    apagado: false,
    criado_em: quando(m.ts),
    editado_em: m.edited ? quando(m.edited.ts) : null,
    atualizado_em: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** A mensagem de cima de um ts, com as reações e a contagem das respostas. */
async function mensagemDoCanal(canal: string, ts: string): Promise<Mensagem | null> {
  const r = await slack<{ messages: Mensagem[] }>("conversations.history", {
    channel: canal,
    latest: ts,
    inclusive: "true",
    limit: "1",
  });
  const m = r.messages[0];
  return m && m.ts === ts ? m : null;
}

/** A releitura de um canal: as mensagens do período, e as que sumiram do Slack somem daqui também. */
async function lerCanal(canal: string, dias: number) {
  const desde = String(Math.floor(Date.now() / 1000) - dias * 86_400);
  const todas: Mensagem[] = [];
  let cursor: string | undefined;
  do {
    const r = await slack<{ messages: Mensagem[]; response_metadata?: { next_cursor?: string } }>(
      "conversations.history",
      {
        channel: canal,
        oldest: desde,
        limit: "200",
        ...(cursor ? { cursor } : {}),
      },
    );
    todas.push(...r.messages.filter(ehComunicado));
    cursor = r.response_metadata?.next_cursor || undefined;
  } while (cursor);
  for (const m of todas) await gravarComunicado(canal, m);
  const vivos = todas.map((m) => m.ts);
  if (vivos.length)
    await supabaseAdmin
      .from("mural_comunicados")
      .update({ apagado: true })
      .eq("canal", canal)
      .gte("criado_em", new Date(Number(desde) * 1000).toISOString())
      .not("ts", "in", `(${vivos.map((t) => `"${t}"`).join(",")})`);
}

/**
 * A releitura dos canais, se a última tem mais de `minutos`. Uma falha num canal não impede o outro; só uma
 * leitura que deu certo nos dois conta como feita (numa falha, a reserva vence sozinha em 2 minutos).
 */
export async function lerMuralSePreciso(minutos = 5): Promise<boolean> {
  const { data: reservada } = await supabaseAdmin.rpc("reservar_leitura_do_mural", {
    _minutos: minutos,
  });
  if (!reservada) return false;
  const falhas: string[] = [];
  for (const [canal, dias] of Object.entries(CANAIS)) {
    try {
      await lerCanal(canal, dias);
    } catch (e) {
      falhas.push(`${canal}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (falhas.length) throw new Error(falhas.join("; "));
  await supabaseAdmin.rpc("concluir_leitura_do_mural");
  return true;
}

type Evento = {
  type: string;
  channel?: string;
  subtype?: string;
  ts?: string;
  thread_ts?: string;
  message?: Mensagem;
  previous_message?: Mensagem;
  deleted_ts?: string;
  item?: { type: string; channel: string; ts: string };
};

/** Um aviso do Slack: grava a mudança (e o banco empurra para quem está com a tela aberta). */
export async function tratarEvento(e: Evento): Promise<void> {
  const canal = e.channel ?? e.item?.channel;
  if (!canal || !(canal in CANAIS)) return;
  if (e.type === "reaction_added" || e.type === "reaction_removed") {
    const m = e.item?.ts ? await mensagemDoCanal(canal, e.item.ts) : null;
    if (m) await gravarComunicado(canal, m);
    return;
  }
  if (e.type !== "message") return;
  if (e.subtype === "message_deleted") {
    const de = e.previous_message;
    if (de?.thread_ts && de.thread_ts !== de.ts) {
      const pai = await mensagemDoCanal(canal, de.thread_ts);
      if (pai) await gravarComunicado(canal, pai);
    } else if (e.deleted_ts)
      await supabaseAdmin
        .from("mural_comunicados")
        .update({ apagado: true })
        .eq("canal", canal)
        .eq("ts", e.deleted_ts);
    return;
  }
  // Uma mensagem nova, uma resposta ou uma edição: relê a mensagem de cima (com a conversa inteira).
  const m = e.subtype === "message_changed" ? e.message : (e as unknown as Mensagem);
  const topo = m?.thread_ts && m.thread_ts !== m.ts ? m.thread_ts : m?.ts;
  if (!topo) return;
  const pai = await mensagemDoCanal(canal, topo);
  if (pai && ehComunicado(pai)) await gravarComunicado(canal, pai);
}
