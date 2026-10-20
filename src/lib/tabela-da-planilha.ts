/**
 * A tabela da supervisão (16/10/2026): uma CÓPIA das abas da planilha, arrumada no layout do CX Hub.
 * Nada é calculado: os valores e a formatação são os da planilha. Esta regra só decide a apresentação
 * (os grupos do cabeçalho e os nomes curtos), pelo NOME de cada coluna, para que uma coluna nova (ou uma
 * mudança de ordem) apareça sozinha. Puro, para ser testado.
 */
export type Coluna = {
  indice: number | null;
  nome: string;
  curto: string;
  grupo: string;
  aguardando?: boolean;
};
export type Grupo = { nome: string; colunas: Coluna[]; aguardando?: boolean };

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const SEGMENTO = /^\[(b2c|b2b|geral)\]\s*/i; // (20/10/2026) o "[Geral]": o SLA geral do Intercom

/** O grupo e o nome curto de uma coluna da planilha. */
export function classificar(nome: string): { grupo: string; curto: string } {
  const n = normal(nome);
  const emSegundos = /\(s\)\s*$/.test(n);
  const canal = (t: string) => (/\bemail\b/.test(t) ? "e-mail" : "chat");
  if (n === "data") return { grupo: "", curto: "Data" };
  if (n === "membro") return { grupo: "", curto: "Membro" };
  if (n.startsWith("conversas atribuidas ("))
    return {
      grupo: "Conversas atribuídas",
      curto: n.includes("membro") ? "Membro da equipe" : "Total",
    };
  if (n === "horas ativas") return { grupo: "Horas", curto: "Ativas" };
  if (n.startsWith("conv. atribuidas por hora ativa")) {
    const resto = nome.split(/-\s*/).slice(1).join("-").trim();
    return {
      grupo: "Por hora ativa",
      curto: resto ? resto[0]!.toUpperCase() + resto.slice(1) : nome,
    };
  }
  if (n === "csat %") return { grupo: "CSAT", curto: "%" };
  if (n === "csat avaliacoes positivas") return { grupo: "CSAT", curto: "Positivas" };
  if (n === "csat total de avaliacoes") return { grupo: "CSAT", curto: "Total" };
  if (n === "avaliacoes csat") return { grupo: "CSAT", curto: "Avaliações" };
  if (n.startsWith("sla geral"))
    return { grupo: "SLA geral (percentil)", curto: canal(n) === "chat" ? "Chat" : "E-mail" };
  const seg = nome.match(SEGMENTO);
  if (seg && n.includes("sla")) {
    const resto = n.replace(SEGMENTO, "");
    const geral = seg[1]!.toLowerCase() === "geral";
    return {
      grupo: `${geral ? "SLA geral" : `SLA do ${seg[1]!.toUpperCase()}`}${emSegundos ? " (s)" : ""}`,
      curto: `${resto.includes("primeira resposta") ? "1ª resp. " : ""}${canal(resto)}`
        .replace(/^chat$/, "Chat")
        .replace(/^e-mail$/, "E-mail"),
    };
  }
  return { grupo: "Outras", curto: nome };
}

/** As colunas, na ordem da planilha, agrupadas (os vizinhos do mesmo grupo); e o SLA geral, se faltar. */
export function gruposDaTabela(cabecalho: string[]): Grupo[] {
  const colunas: Coluna[] = cabecalho.map((nome, indice) => ({
    indice,
    nome,
    ...classificar(nome),
  }));
  // As duas colunas do SLA geral esperam a planilha só enquanto ela não as tem (o "[Geral]", desde 20/10/2026).
  if (!colunas.some((c) => c.grupo.startsWith("SLA geral")))
    colunas.push(
      {
        indice: null,
        nome: "SLA geral chat (percentil)",
        curto: "Chat",
        grupo: "SLA geral (percentil)",
        aguardando: true,
      },
      {
        indice: null,
        nome: "SLA geral email (percentil)",
        curto: "E-mail",
        grupo: "SLA geral (percentil)",
        aguardando: true,
      },
    );
  const grupos: Grupo[] = [];
  for (const c of colunas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nome === c.grupo) ultimo.colunas.push(c);
    else
      grupos.push({ nome: c.grupo, colunas: [c], ...(c.aguardando ? { aguardando: true } : {}) });
  }
  return grupos;
}

/** A aba "Análise": as informações do período (acima) e a tabela (a partir da linha que começa em "Membro"). */
export function tabelaDaAnalise(valores: string[][]): {
  info: [string, string][];
  cabecalho: string[];
  linhas: string[][];
} {
  const i = valores.findIndex((l) => normal(l[0] ?? "") === "membro");
  if (i < 0) return { info: [], cabecalho: [], linhas: [] };
  const MOSTRAR = [
    "periodo",
    "inicio do periodo",
    "fim do periodo",
    "ultima data coletada",
    "sla: estatistica",
  ];
  const info = valores
    .slice(0, i)
    .filter((l) => MOSTRAR.includes(normal(l[0] ?? "")) && (l[1] ?? "") !== "")
    .map((l) => [l[0]!, l[1]!] as [string, string]);
  const cabecalho = valores[i]!;
  const linhas: string[][] = [];
  for (const l of valores.slice(i + 1)) {
    if (!(l[0] ?? "").trim()) break; // a tabela acaba na primeira linha vazia
    linhas.push(cabecalho.map((_, k) => l[k] ?? ""));
  }
  return { info, cabecalho, linhas };
}

/** As linhas da aba "Dados" (a cópia do dia), do tamanho do cabeçalho. */
export const linhasDosDados = (valores: string[][]) => {
  const [cabecalho = [], ...corpo] = valores;
  return { cabecalho, linhas: corpo.map((l) => cabecalho.map((_, k) => l[k] ?? "")) };
};
