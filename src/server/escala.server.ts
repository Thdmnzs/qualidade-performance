/**
 * A leitura da planilha da escala (10/10/2026), pelo robô do Google, só de leitura.
 * Lê o texto, a COR DE FUNDO e as mesclas de cada aba, e guarda por 2 minutos (a
 * supervisora pode mudar no dia; o botão "Atualizar" lê na hora).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  abaDaSemana,
  cadastroDoNome,
  lerFerias,
  lerSemana,
  normalizar,
  periodoDaAba,
  type AbaBruta,
  type Celula,
  type Ferias,
  type Semana,
} from "@/lib/escala";
import { tokenDoGoogle } from "@/server/google.server";

export class ErroDaEscala extends Error {}

const ESCOPO = "https://www.googleapis.com/auth/spreadsheets.readonly";
const MEMORIA_MS = 2 * 60_000;
const ATUALIZAR_NO_MINIMO_MS = 15_000; // o "Atualizar" não vira uma enxurrada de leituras
const planilhaId = () =>
  process.env["ESCALA_PLANILHA_ID"] || "1JiXqutyy7BKV5b8aEuyhEDblMVX5iYtQwG4m0CIkpx4";
export const linkDaPlanilha = () => `https://docs.google.com/spreadsheets/d/${planilhaId()}/edit`;

const memoria = new Map<string, { ate: number; lidaEm: number; dados: unknown }>();
export const esquecerMemoriaDaEscala = () => memoria.clear();

async function doGoogle<T>(caminho: string): Promise<T> {
  const token = await tokenDoGoogle(ESCOPO);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${planilhaId()}${caminho}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 403 || r.status === 404) {
    throw new ErroDaEscala("A planilha da escala não está compartilhada com o robô do QualityHUB.");
  }
  if (!r.ok)
    throw new ErroDaEscala(`O Google não conseguiu ler a planilha agora (código ${r.status}).`);
  return (await r.json()) as T;
}

async function lembrado<T>(
  chave: string,
  forcar: boolean,
  ler: () => Promise<T>,
): Promise<{ dados: T; lidaEm: number }> {
  const agora = Date.now();
  const m = memoria.get(chave);
  // Sem "Atualizar": vale a leitura dos últimos 2 minutos. Com "Atualizar": lê de novo, a não
  // ser que a última leitura tenha sido há menos de 15 segundos.
  const usarGuardada = m && (forcar ? agora - m.lidaEm < ATUALIZAR_NO_MINIMO_MS : m.ate > agora);
  if (m && usarGuardada) return { dados: m.dados as T, lidaEm: m.lidaEm };
  const dados = await ler();
  memoria.set(chave, { ate: agora + MEMORIA_MS, lidaEm: agora, dados });
  return { dados, lidaEm: agora };
}

type Cor = { red?: number; green?: number; blue?: number };
const hex = (c: Cor | undefined): string | null => {
  if (!c) return null;
  const v = [c.red ?? 0, c.green ?? 0, c.blue ?? 0]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
  return v === "ffffff" ? null : `#${v}`; // o branco é "sem cor"
};

async function titulosDasAbas(forcar: boolean): Promise<string[]> {
  const { dados } = await lembrado("abas", forcar, async () => {
    const j = await doGoogle<{ sheets?: { properties?: { title?: string } }[] }>(
      "?fields=sheets.properties.title",
    );
    return (j.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
  });
  return dados;
}

/** Uma aba inteira: o texto, a cor de fundo e as mesclas de cada célula. */
async function lerAbaBruta(
  titulo: string,
  forcar: boolean,
): Promise<{ aba: AbaBruta; lidaEm: number }> {
  const { dados, lidaEm } = await lembrado(`aba:${titulo}`, forcar, async () => {
    const intervalo = encodeURIComponent(`'${titulo.replace(/'/g, "''")}'!A1:Z240`);
    type Resposta = {
      sheets?: {
        merges?: {
          startRowIndex?: number;
          endRowIndex?: number;
          startColumnIndex?: number;
          endColumnIndex?: number;
        }[];
        data?: {
          rowData?: {
            values?: { formattedValue?: string; effectiveFormat?: { backgroundColor?: Cor } }[];
          }[];
        }[];
      }[];
    };
    const j = await doGoogle<Resposta>(
      `?ranges=${intervalo}&includeGridData=true&fields=${encodeURIComponent("sheets(merges,data(rowData(values(formattedValue,effectiveFormat/backgroundColor))))")}`,
    );
    const folha = j.sheets?.[0];
    const linhas: Celula[][] = (folha?.data?.[0]?.rowData ?? []).map((r) =>
      (r.values ?? []).map((v) => ({
        texto: v.formattedValue?.trim() || null,
        cor: hex(v.effectiveFormat?.backgroundColor),
      })),
    );
    const mesclas = (folha?.merges ?? []).map((m) => ({
      r0: m.startRowIndex ?? 0,
      r1: m.endRowIndex ?? 0,
      c0: m.startColumnIndex ?? 0,
      c1: m.endColumnIndex ?? 0,
    }));
    return { titulo, linhas, mesclas } satisfies AbaBruta;
  });
  return { aba: dados, lidaEm };
}

// ---------- Quem está chamando: um membro ativo, e o nome dele na planilha ----------
async function quemChama(chamadorId: string) {
  const [{ data: eu }, { data: adm }] = await Promise.all([
    supabaseAdmin
      .from("employees")
      .select("id, nome")
      .eq("user_id", chamadorId)
      .eq("status", "ativo")
      .maybeSingle(),
    supabaseAdmin.rpc("is_admin", { _user_id: chamadorId }),
  ]);
  if (!eu) throw new ErroDaEscala("Seu acesso não está vinculado a um colaborador ativo.");
  return { eu, ehAdm: !!adm };
}
async function cadastrosAtivos() {
  const { data } = await supabaseAdmin.from("employees").select("id, nome").eq("status", "ativo");
  return data ?? [];
}

export type RespostaDaSemana = {
  abas: { titulo: string; inicio: string; fim: string }[];
  titulo: string | null;
  semana: Semana | null;
  lidaEm: number | null;
  eu: string | null;
  ehAdm: boolean;
  leitura: {
    planilha: string;
    semCadastro: string[];
    encontrados: { planilha: string; cadastro: string }[];
  } | null;
};

export async function lerEscalaDaSemana(p: {
  chamadorId: string;
  aba?: string | undefined;
  forcar?: boolean | undefined;
}): Promise<RespostaDaSemana> {
  const { eu, ehAdm } = await quemChama(p.chamadorId);
  const hoje = new Date();
  const abas = (await titulosDasAbas(!!p.forcar))
    .map((t) => ({ titulo: t, periodo: periodoDaAba(t, hoje) }))
    .filter((a): a is { titulo: string; periodo: { inicio: string; fim: string } } => !!a.periodo)
    .map((a) => ({ titulo: a.titulo, ...a.periodo }))
    .sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
  const titulo = p.aba && abas.some((a) => a.titulo === p.aba) ? p.aba : abaDaSemana(abas, hoje);
  if (!titulo)
    return { abas, titulo: null, semana: null, lidaEm: null, eu: null, ehAdm, leitura: null };
  const { aba, lidaEm } = await lerAbaBruta(titulo, !!p.forcar);
  const semana = lerSemana(aba, hoje);
  const nomes = [...new Set(semana.dias.flatMap((d) => d.pessoas.map((x) => x.nome)))];
  const cadastros = ehAdm ? await cadastrosAtivos() : [eu];
  const meuNome =
    nomes.find((n) => cadastroDoNome(n, ehAdm ? cadastros : [eu])?.id === eu.id) ?? null;
  let leitura: RespostaDaSemana["leitura"] = null;
  if (ehAdm) {
    const encontrados: { planilha: string; cadastro: string }[] = [];
    const semCadastro: string[] = [];
    for (const n of nomes) {
      const c = cadastroDoNome(n, cadastros);
      if (c) encontrados.push({ planilha: n, cadastro: c.nome });
      else semCadastro.push(n);
    }
    leitura = { planilha: linkDaPlanilha(), semCadastro, encontrados };
  }
  return { abas, titulo, semana, lidaEm, eu: meuNome, ehAdm, leitura };
}

export async function lerFeriasDoAno(p: {
  chamadorId: string;
  forcar?: boolean | undefined;
}): Promise<{
  titulo: string | null;
  ferias: Ferias | null;
  lidaEm: number | null;
  eu: string | null;
}> {
  const { eu } = await quemChama(p.chamadorId);
  const titulo = (await titulosDasAbas(!!p.forcar))
    .filter((t) => normalizar(t).startsWith("ferias"))
    .sort((a, b) => (normalizar(a) < normalizar(b) ? 1 : -1))[0]; // a mais recente ("férias 26")
  if (!titulo) return { titulo: null, ferias: null, lidaEm: null, eu: null };
  const { aba, lidaEm } = await lerAbaBruta(titulo, !!p.forcar);
  const ferias = lerFerias(aba);
  const nomes = [...new Set(Object.values(ferias.dias).flatMap((d) => d.pessoas))];
  const meuNome = nomes.find((n) => cadastroDoNome(n, [eu])?.id === eu.id) ?? null;
  return { titulo, ferias, lidaEm, eu: meuNome };
}
