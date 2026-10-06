/**
 * Sincronização da base de processos com o Notion. SÓ RODA NO SERVIDOR.
 *
 * O token (NOTION_TOKEN) fica na Vercel, como segredo, e nunca vai para o
 * navegador. Tudo aqui é LEITURA no Notion; a escrita é no nosso banco, pela
 * função registrar_versao_processo (uma versão nova só quando o texto muda).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  blocosParaTexto,
  idSemHifens,
  itemDoIndice,
  montarProcesso,
  textoRico,
  type Bloco,
  type ItemDaFila,
  type LinhaDoIndice,
} from "@/lib/notion";

/** Versão da API do Notion (consulta de bases pelo endpoint /databases). */
const VERSAO_API = "2022-06-28";

/** As fontes: os dois Índices Mestres (com a base dentro) e as páginas de referência. */
const FONTES = {
  indices: [
    { base: "B2C" as const, nome: "Índice Mestre B2C", pagina: "3a7cc47b1d7c81f39b8becc0579cebf7" },
    { base: "B2B" as const, nome: "Índice Mestre B2B", pagina: "3eacc47b1d7c8185a800c87a24fd0b7f" },
  ],
  // Páginas avulsas, fora das Flukepédias: cada uma precisa de acesso próprio na conexão.
  referencias: [
    {
      chave: "Guia",
      nome: "Guia de Clientes Atritados",
      pagina: "299cc47b1d7c80fbb2c8d2c48a9de99e",
    },
    { chave: "Dicionário", nome: "Dicionário de Tags", pagina: "3d3cc47b1d7c8083b9b2eada252f65c3" },
  ],
};

/** Mensagem clara quando a conexão não enxerga uma página: diz QUAL é. */
async function naFonte<T>(nome: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof ErroDoNotion && /não tem acesso/.test(erro.message)) {
      throw new ErroDoNotion(
        `A conexão do Notion não tem acesso à página "${nome}". Inclua essa página na aba "Acesso" da conexão interna.`,
      );
    }
    throw erro;
  }
}

/** Tempo de trabalho por lote (a função da Vercel tem limite de duração). */
const TEMPO_POR_LOTE_MS = 40_000;
/** O Notion aceita cerca de 3 pedidos por segundo. */
const INTERVALO_MS = 340;

export class ErroDoNotion extends Error {}

let ultimoPedido = 0;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chamar<T>(caminho: string, corpo?: unknown, tentativa = 0): Promise<T> {
  const token = process.env["NOTION_TOKEN"];
  if (!token) {
    throw new ErroDoNotion(
      "O token do Notion não está configurado no servidor. Cadastre NOTION_TOKEN na Vercel e faça um novo deploy.",
    );
  }
  const espera = ultimoPedido + INTERVALO_MS - Date.now();
  if (espera > 0) await esperar(espera);
  ultimoPedido = Date.now();

  let r: Response;
  try {
    r = await fetch(`https://api.notion.com/v1${caminho}`, {
      method: corpo ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": VERSAO_API,
        ...(corpo ? { "Content-Type": "application/json" } : {}),
      },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
  } catch (erro) {
    console.error("[notion] falha de rede:", caminho, erro);
    throw new ErroDoNotion(
      "Não foi possível falar com o Notion. Tente novamente em alguns minutos.",
    );
  }

  // Limite de velocidade: espera o tempo pedido pelo Notion e tenta de novo (até 3 vezes).
  if (r.status === 429 && tentativa < 3) {
    const segundos = Number(r.headers.get("Retry-After") ?? "2");
    await esperar(Math.min(30, Math.max(1, segundos)) * 1000);
    return chamar<T>(caminho, corpo, tentativa + 1);
  }
  if (r.status === 401) {
    throw new ErroDoNotion(
      "O Notion recusou o token (inválido ou revogado). Gere um novo na conexão interna e atualize na Vercel.",
    );
  }
  if (r.status === 404 || r.status === 403) {
    throw new ErroDoNotion(
      `A conexão do Notion não tem acesso a uma das páginas (${caminho.split("/")[2] ?? caminho}). Confira a aba "Acesso" da conexão interna.`,
    );
  }
  if (!r.ok) {
    console.error("[notion]", caminho, r.status, await r.text().catch(() => ""));
    throw new ErroDoNotion(`O Notion respondeu com erro (${r.status}). Tente novamente.`);
  }
  return (await r.json()) as T;
}

type Lista<T> = { results: T[]; has_more?: boolean; next_cursor?: string | null };

async function filhosDe(blocoId: string): Promise<Bloco[]> {
  const todos: Bloco[] = [];
  let cursor: string | null | undefined;
  do {
    const r = await chamar<Lista<Bloco>>(
      `/blocks/${blocoId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    todos.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return todos;
}

/** Blocos da página com os filhos (macros dentro de blocos recolhíveis, avisos, listas, tabelas). */
async function lerBlocos(id: string, profundidade = 0): Promise<Bloco[]> {
  const blocos = await filhosDe(id);
  if (profundidade >= 8) return blocos;
  for (const b of blocos) {
    if (!b.has_children || b.type === "child_page" || b.type === "child_database") continue;
    // Bloco sincronizado que aponta para outro: lê o original.
    const original = (b["synced_block"] as { synced_from?: { block_id?: string } } | undefined)
      ?.synced_from?.block_id;
    b.filhos = await lerBlocos(original ?? b.id, profundidade + 1);
  }
  return blocos;
}

/** A base de dados que está dentro da página do Índice. */
async function baseDentroDe(paginaIndice: string): Promise<string> {
  const blocos = await filhosDe(paginaIndice);
  const base = blocos.find((b) => b.type === "child_database");
  if (!base)
    throw new ErroDoNotion("Não encontrei a base de dados dentro da página do Índice Mestre.");
  return base.id;
}

async function linhasDaBase(baseId: string): Promise<LinhaDoIndice[]> {
  const todas: LinhaDoIndice[] = [];
  let cursor: string | null | undefined;
  do {
    const r = await chamar<Lista<LinhaDoIndice>>(`/databases/${baseId}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    todas.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return todas;
}

type Pagina = {
  id: string;
  last_edited_time: string;
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, { type?: string; title?: unknown }>;
};

const tituloDaPagina = (p: Pagina) => {
  const prop = Object.values(p.properties ?? {}).find((x) => x.type === "title");
  return textoRico(prop?.title).trim() || "(sem título)";
};

async function exigirAdmin(chamadorId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_admin", { _user_id: chamadorId });
  if (error || !data)
    throw new ErroDoNotion("Apenas administradores podem sincronizar a base de processos.");
}

/** Monta a fila completa: as linhas dos dois Índices e o Guia. */
async function montarFila(): Promise<{
  fila: ItemDaFila[];
  porBase: Record<string, { processos: number; revisados: number }>;
}> {
  const fila: ItemDaFila[] = [];
  const porBase: Record<string, { processos: number; revisados: number }> = {};
  for (const indice of FONTES.indices) {
    const linhas = await naFonte(indice.nome, async () =>
      linhasDaBase(await baseDentroDe(indice.pagina)),
    );
    const itens = linhas
      .map((l) => itemDoIndice(l, indice.base))
      .filter((x): x is ItemDaFila => !!x);
    porBase[indice.base] = {
      processos: itens.length,
      revisados: itens.filter((i) => i.revisado).length,
    };
    fila.push(...itens);
  }
  for (const ref of FONTES.referencias) {
    const pagina = await naFonte(ref.nome, () => chamar<Pagina>(`/pages/${ref.pagina}`));
    fila.push({
      pageId: idSemHifens(pagina.id),
      base: "Guia",
      codigo: null,
      titulo: tituloDaPagina(pagina),
      categoria: null,
      subcategoria: null,
      revisado: false,
      ultimaRevisao: null,
      url: `https://www.notion.so/${idSemHifens(pagina.id)}`,
    });
    porBase[ref.chave] = { processos: 1, revisados: 0 };
  }
  // Sem repetidos (o mesmo processo listado duas vezes no Índice).
  const vistos = new Set<string>();
  return {
    fila: fila.filter((i) => (vistos.has(i.pageId) ? false : (vistos.add(i.pageId), true))),
    porBase,
  };
}

export type Progresso = {
  id: string;
  status: "em_andamento" | "concluida" | "falhou";
  total: number;
  processados: number;
  novos: number;
  alterados: number;
  semMudanca: number;
  erros: number;
};

/** Teste de conexão: confere o token e conta os processos de cada Índice, sem baixar conteúdo. */
export async function testarNotion(chamadorId: string) {
  await exigirAdmin(chamadorId);
  // Cada fonte à parte: uma sem acesso não esconde o resultado das outras.
  const porBase: Record<string, { processos: number; revisados: number } | { erro: string }> = {};
  for (const indice of FONTES.indices) {
    try {
      const linhas = await naFonte(indice.nome, async () =>
        linhasDaBase(await baseDentroDe(indice.pagina)),
      );
      const itens = linhas
        .map((l) => itemDoIndice(l, indice.base))
        .filter((x): x is ItemDaFila => !!x);
      porBase[indice.base] = {
        processos: itens.length,
        revisados: itens.filter((i) => i.revisado).length,
      };
    } catch (erro) {
      if (erro instanceof ErroDoNotion && /token/.test(erro.message)) throw erro;
      porBase[indice.base] = { erro: erro instanceof Error ? erro.message : "Erro ao ler." };
    }
  }
  for (const ref of FONTES.referencias) {
    try {
      await naFonte(ref.nome, () => chamar<Pagina>(`/pages/${ref.pagina}`));
      porBase[ref.chave] = { processos: 1, revisados: 0 };
    } catch (erro) {
      if (erro instanceof ErroDoNotion && /token/.test(erro.message)) throw erro;
      porBase[ref.chave] = { erro: erro instanceof Error ? erro.message : "Erro ao ler." };
    }
  }
  await supabaseAdmin.from("processos_sincronizacoes").insert({
    iniciada_por: chamadorId,
    status: "concluida",
    concluida_em: new Date().toISOString(),
    resumo: { tipo: "teste_de_conexao", bases: porBase },
  });
  return porBase;
}

/** Começa uma sincronização, ou devolve a que está em andamento (para continuar). */
export async function iniciarSincronizacao(chamadorId: string): Promise<Progresso> {
  await exigirAdmin(chamadorId);
  const { data: aberta } = await supabaseAdmin
    .from("processos_sincronizacoes")
    .select("*")
    .eq("status", "em_andamento")
    .maybeSingle();
  if (aberta) return paraProgresso(aberta);

  const { fila, porBase } = await montarFila();
  const { data, error } = await supabaseAdmin
    .from("processos_sincronizacoes")
    .insert({
      iniciada_por: chamadorId,
      total: fila.length,
      fila: fila as never,
      resumo: { tipo: "sincronizacao", bases: porBase, presentes: fila.map((i) => i.pageId) },
    })
    .select("*")
    .single();
  if (error || !data)
    throw new ErroDoNotion(error?.message ?? "Não foi possível iniciar a sincronização.");
  return paraProgresso(data);
}

type LinhaSinc = {
  id: string;
  status: string;
  total: number;
  processados: number;
  novos: number;
  alterados: number;
  sem_mudanca: number;
  fila: unknown;
  resumo: unknown;
  erros: unknown;
};

const paraProgresso = (s: LinhaSinc): Progresso => ({
  id: s.id,
  status: s.status as Progresso["status"],
  total: s.total,
  processados: s.processados,
  novos: s.novos,
  alterados: s.alterados,
  semMudanca: s.sem_mudanca,
  erros: Array.isArray(s.erros) ? s.erros.length : 0,
});

/** Processa um lote (cerca de 40 s) e devolve o andamento. A tela chama até concluir. */
export async function continuarSincronizacao(chamadorId: string, id: string): Promise<Progresso> {
  await exigirAdmin(chamadorId);
  const { data: s, error } = await supabaseAdmin
    .from("processos_sincronizacoes")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !s) throw new ErroDoNotion("Sincronização não encontrada.");
  if (s.status !== "em_andamento") return paraProgresso(s);

  const fila = [...((s.fila as ItemDaFila[]) ?? [])];
  const erros = [...((s.erros as unknown[]) ?? [])];
  const cont = {
    processados: s.processados,
    novos: s.novos,
    alterados: s.alterados,
    sem_mudanca: s.sem_mudanca,
  };
  const inicio = Date.now();

  while (fila.length > 0 && Date.now() - inicio < TEMPO_POR_LOTE_MS) {
    const item = fila.shift()!;
    try {
      const pagina = await chamar<Pagina>(`/pages/${item.pageId}`);
      if (pagina.archived || pagina.in_trash) {
        erros.push({
          codigo: item.codigo,
          titulo: item.titulo,
          erro: "Página arquivada no Notion",
        });
      } else {
        const { data: atual } = await supabaseAdmin
          .from("processos")
          .select("editado_no_notion, versao_atual")
          .eq("notion_page_id", item.pageId)
          .maybeSingle();
        const igual =
          atual &&
          atual.versao_atual > 0 &&
          atual.editado_no_notion &&
          new Date(atual.editado_no_notion).getTime() ===
            new Date(pagina.last_edited_time).getTime();
        if (igual) {
          // Página sem edição: só atualiza código, status de revisão e classificação (vêm do Índice).
          await supabaseAdmin
            .from("processos")
            .update({
              codigo: item.codigo,
              titulo: item.titulo,
              categoria: item.categoria,
              subcategoria: item.subcategoria,
              revisado: item.revisado,
              ultima_revisao: item.ultimaRevisao,
              sincronizado_em: new Date().toISOString(),
              ativo: true,
            })
            .eq("notion_page_id", item.pageId);
          cont.sem_mudanca += 1;
        } else {
          const texto = montarProcesso(item, blocosParaTexto(await lerBlocos(item.pageId)));
          const { data: resultado, error: erroGravar } = await supabaseAdmin.rpc(
            "registrar_versao_processo",
            {
              _notion_page_id: item.pageId,
              _base: item.base,
              _codigo: item.codigo ?? "",
              _titulo: item.titulo,
              _categoria: item.categoria ?? "",
              _subcategoria: item.subcategoria ?? "",
              _url: item.url,
              _revisado: item.revisado,
              _ultima_revisao: item.ultimaRevisao as string,
              _editado_no_notion: pagina.last_edited_time,
              _conteudo: texto,
              _origem: "sincronizacao",
            },
          );
          if (erroGravar) throw new Error(erroGravar.message);
          if (resultado === "nova") cont.novos += 1;
          else if (resultado === "alterada") cont.alterados += 1;
          else cont.sem_mudanca += 1;
        }
      }
    } catch (erro) {
      // Um processo com problema não para a sincronização: fica registrado e segue.
      if (erro instanceof ErroDoNotion && /token/.test(erro.message)) throw erro;
      erros.push({
        codigo: item.codigo,
        titulo: item.titulo,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
    cont.processados += 1;
  }

  const concluiu = fila.length === 0;
  if (concluiu) {
    const presentes = ((s.resumo as { presentes?: string[] } | null)?.presentes ?? []) as string[];
    await supabaseAdmin.rpc("desativar_processos_ausentes", {
      _bases: ["B2C", "B2B", "Guia"],
      _presentes: presentes,
    });
  }
  const { data: atualizada, error: erroAtualizar } = await supabaseAdmin
    .from("processos_sincronizacoes")
    .update({
      ...cont,
      fila: fila as never,
      erros: erros.slice(-200) as never,
      ...(concluiu ? { status: "concluida", concluida_em: new Date().toISOString() } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (erroAtualizar || !atualizada)
    throw new ErroDoNotion("Não foi possível salvar o andamento da sincronização.");
  return paraProgresso(atualizada);
}
