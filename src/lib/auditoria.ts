/**
 * Auditoria na tela: cada registro técnico vira uma frase clara.
 *
 * A frase sai EM PEDAÇOS (texto e negrito), e não como HTML: o que alguém
 * escreveu (um motivo, uma resposta) entra na tela sempre como texto.
 */
export type Registro = {
  acao: string;
  quem: string;
  alvo: string | null;
  valor_anterior: Record<string, unknown> | null;
  valor_novo: Record<string, unknown> | null;
};
export type Pedaco = { texto: string; negrito?: boolean };
export type Detalhe = { rotulo: string; antes: string | null; depois: string };

export const CATEGORIAS: Record<string, string[]> = {
  Avaliações: ["registrar_avaliacao", "excluir_avaliacao", "registrar_quiz"],
  Contestações: ["abrir_contestacao", "aceitar_contestacao", "recusar_contestacao"],
  Quinzenas: [
    "quinzena_criar",
    "quinzena_publicar",
    "quinzena_fechar",
    "quinzena_reabrir",
    "quinzena_ajuste_prazo",
  ],
  Sorteios: ["sortear_contato", "descartar_contato"],
  "Acessos e cadastros": [
    "criar_acesso",
    "gerar_link_senha",
    "inativar_colaborador",
    "reativar_colaborador",
    "excluir_colaborador",
    "definir_perfil",
    "dados_pessoais_corrigir",
  ],
  Indicadores: ["nome_na_planilha"],
  Segurança: ["senha_alterada"],
  "Treinar a IA": ["orientacao_da_ia", "exemplar_da_ia"],
  "Acesso rápido": [
    "atalho_grupo_criar",
    "atalho_grupo_editar",
    "atalho_grupo_excluir",
    "atalho_criar",
    "atalho_editar",
    "atalho_excluir",
  ],
  Escala: [
    "escala_publicar",
    "escala_mudar_dia",
    "escala_criar_sigla",
    "ferias_marcar",
    "ferias_tirar",
    "feriado_marcar",
    "feriado_tirar",
    "ferias_pedir",
    "ferias_cancelar_pedido",
    "ferias_aprovar",
    "ferias_recusar",
    "escala_troca_aprovar",
    "escala_troca_recusar",
    "escala_troca_aplicar",
    "escala_folga_fixa",
    "escala_horario_de_trabalho",
  ],
};

const DIAS_DA_SEMANA_AUD = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const dataBRCurta = (iso: unknown) =>
  typeof iso === "string" && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "";
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function categoriaDe(acao: string): string {
  for (const [categoria, acoes] of Object.entries(CATEGORIAS))
    if (acoes.includes(acao)) return categoria;
  return "Outras";
}

const STATUS: Record<string, string> = {
  aberta: "aberta",
  em_analise: "em análise",
  em_contestacao: "em contestação",
  pronta_para_fechamento: "pronta para fechamento",
  fechada: "fechada",
};
const TIPO: Record<string, string> = { interacao: "Interação", ticket_n2: "Ticket de back-office" };
const PERFIL: Record<string, string> = {
  adm: "ADM",
  avaliador: "Avaliador",
  colaborador: "Colaborador",
};

const txt = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "number") return String(v).replace(".", ",");
  if (typeof v === "string") return STATUS[v] ?? v;
  return null;
};
const dataBR = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)
    ? v.slice(0, 10).split("-").reverse().join("/")
    : txt(v);

/** A frase do registro, em pedaços. Ações desconhecidas ganham uma frase genérica. */
export function fraseDoRegistro(r: Registro): Pedaco[] {
  const n = r.valor_novo ?? {};
  const alvo = r.alvo ?? (txt(n["colaborador"]) || "um colaborador");
  const q = (s: string) => ({ texto: s });
  const b = (s: string) => ({ texto: s, negrito: true });
  const nota = txt(n["nota"]);
  switch (r.acao) {
    case "registrar_avaliacao":
      return [
        q("registrou uma avaliação de "),
        b(alvo),
        q(` · ${TIPO[String(n["tipo"])] ?? "avaliação"}`),
        ...(txt(n["assunto"]) ? [q(` · ${txt(n["assunto"])}`)] : []),
        ...(nota ? [q(` · nota ${nota}`)] : []),
      ];
    case "excluir_avaliacao":
      return [q("excluiu uma avaliação de "), b(alvo)];
    case "registrar_quiz":
      return [
        q("registrou o quiz de "),
        b(alvo),
        q(`: ${n["entregue"] ? "entregue" : "não entregue"}`),
      ];
    case "abrir_contestacao":
      return [
        q("abriu uma contestação"),
        ...(r.alvo ? [q(" da avaliação de "), b(r.alvo)] : []),
        ...(nota ? [q(` · nota ${nota}`)] : []),
      ];
    case "aceitar_contestacao":
      return [
        q("aceitou a contestação de "),
        b(alvo),
        ...(nota ? [q(` · nova nota ${nota}`)] : []),
      ];
    case "recusar_contestacao":
      return [q("recusou a contestação de "), b(alvo)];
    case "quinzena_criar":
      return [q("criou a "), b(r.alvo ?? "quinzena")];
    case "quinzena_publicar":
      return [q("publicou a "), b(r.alvo ?? "quinzena"), q(" para contestação")];
    case "quinzena_fechar":
      return [q("fechou a "), b(r.alvo ?? "quinzena")];
    case "quinzena_reabrir":
      return [q("reabriu a "), b(r.alvo ?? "quinzena")];
    case "quinzena_ajuste_prazo":
      return [q("ajustou o prazo de contestação da "), b(r.alvo ?? "quinzena")];
    case "sortear_contato":
      return [
        q("sorteou um contato de "),
        b(alvo),
        q(` · ${TIPO[String(n["tipo"])] ?? "Interação"}`),
      ];
    case "descartar_contato":
      return [q("descartou um contato sorteado de "), b(alvo)];
    case "criar_acesso":
      return [
        q("criou o acesso de "),
        b(txt(n["email"]) ?? alvo),
        ...(n["perfil"] ? [q(` · ${PERFIL[String(n["perfil"])] ?? n["perfil"]}`)] : []),
      ];
    case "gerar_link_senha":
      return [q("gerou um link de definição de senha para "), b(r.alvo ?? "um colaborador")];
    case "inativar_colaborador":
      return [q("inativou o cadastro de "), b(r.alvo ?? "um colaborador")];
    case "reativar_colaborador":
      return [q("reativou o cadastro de "), b(r.alvo ?? "um colaborador")];
    case "excluir_colaborador":
      return [q("excluiu definitivamente um cadastro inativo")];
    case "definir_perfil":
      return [
        q("mudou o perfil de "),
        b(r.alvo ?? "um colaborador"),
        ...(txt(n["perfil"]) ? [q(` para ${PERFIL[String(n["perfil"])] ?? n["perfil"]}`)] : []),
      ];
    case "escala_publicar": {
      const ini = String(n["inicio"] ?? "");
      return [
        q("publicou a escala da semana de "),
        b(`${dataBRCurta(ini)} a ${dataBRCurta(ini ? somaDias(ini, 6) : "")}`),
      ];
    }
    case "escala_mudar_dia": {
      const ini = String(n["inicio"] ?? "");
      const d = Number(n["dia"] ?? 0);
      return [
        q("mudou a escala de "),
        b(`${DIAS_DA_SEMANA_AUD[d] ?? "um dia"}, ${dataBRCurta(ini ? somaDias(ini, d) : "")}`),
        q(", depois de publicada"),
      ];
    }
    case "escala_criar_sigla":
      return [
        q("criou a atividade "),
        b(txt(n["sigla"]) ?? ""),
        ...(txt(n["significado"]) ? [q(` (${n["significado"]})`)] : []),
        q(" na escala"),
      ];
    case "ferias_marcar":
    case "ferias_tirar": {
      const datas = Array.isArray(n["datas"]) ? (n["datas"] as string[]) : [];
      const quanto =
        datas.length === 1
          ? `o dia ${dataBRCurta(datas[0])}`
          : `${datas.length} dias (de ${dataBRCurta(datas[0])} a ${dataBRCurta(datas[datas.length - 1])})`;
      return [
        q(r.acao === "ferias_marcar" ? "marcou as férias de " : "tirou as férias de "),
        b(alvo),
        q(`: ${quanto}`),
      ];
    }
    case "ferias_pedir":
    case "ferias_cancelar_pedido":
    case "ferias_aprovar":
    case "ferias_recusar": {
      const de = String(n["de"] ?? "");
      const ate = String(n["ate"] ?? "");
      const periodo =
        de === ate ? `o dia ${dataBRCurta(de)}` : `${dataBRCurta(de)} a ${dataBRCurta(ate)}`;
      if (r.acao === "ferias_aprovar" || r.acao === "ferias_recusar") {
        return [
          q(r.acao === "ferias_aprovar" ? "aprovou as férias de " : "recusou as férias de "),
          b(alvo),
          q(`: ${periodo}`),
          ...(txt(n["motivo"]) ? [q(` · motivo: ${n["motivo"]}`)] : []),
        ];
      }
      return [
        q(r.acao === "ferias_pedir" ? "pediu férias: " : "cancelou o pedido de férias: "),
        b(periodo),
      ];
    }
    case "dados_pessoais_corrigir": {
      // Só os NOMES das partes (o endereço, o contato...), nunca os valores.
      const partes = Array.isArray(n["partes"]) ? (n["partes"] as string[]) : [];
      const lista =
        partes.length > 1
          ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`
          : (partes[0] ?? "os dados pessoais");
      return [q("corrigiu "), q(lista), q(" de "), b(alvo)];
    }
    case "escala_horario_de_trabalho": {
      const e = n["entrada"],
        s = n["saida"],
        p = n["pausa"];
      return [
        q("definiu o horário de trabalho de "),
        b(alvo),
        q(
          e == null
            ? ": sem horário"
            : `: das ${e}h às ${s}h, com a pausa às ${p}h${fimDeSemanaNoHistorico(n)}`,
        ),
      ];
    }
    // Treinar a IA (20/10/2026)
    case "orientacao_da_ia":
      return n["vazia"]
        ? [q("apagou a orientação da IA do critério "), b(txt(n["criterio"]) ?? "")]
        : [q("escreveu a orientação da IA do critério "), b(txt(n["criterio"]) ?? "")];
    case "exemplar_da_ia":
      return n["exemplar"]
        ? [q("marcou como exemplar a avaliação de "), b(txt(n["colaborador"]) ?? alvo)]
        : [q("tirou dos exemplares a avaliação de "), b(txt(n["colaborador"]) ?? alvo)];
    // A troca de senha pela própria pessoa (16/10/2026): nunca registra a senha
    case "senha_alterada":
      return [q("alterou a própria senha")];
    // Os indicadores pela planilha (16/10/2026)
    case "nome_na_planilha":
      return n["nome_na_planilha"] == null
        ? [q("desligou o nome da planilha de "), b(alvo)]
        : [
            q("ligou o nome da planilha "),
            b(`“${txt(n["nome_na_planilha"]) ?? ""}”`),
            q(" a "),
            b(alvo),
          ];
    // O acesso rápido (14/10/2026)
    case "atalho_grupo_criar":
      return [q("criou o grupo "), b(txt(n["grupo"]) ?? ""), q(" no acesso rápido")];
    case "atalho_grupo_editar":
      return [q("editou o grupo "), b(txt(n["grupo"]) ?? ""), q(" do acesso rápido")];
    case "atalho_grupo_excluir":
      return [
        q("excluiu o grupo "),
        b(txt(n["grupo"]) ?? ""),
        q(` do acesso rápido${Number(n["links"]) ? `, com ${String(n["links"])} links` : ""}`),
      ];
    case "atalho_criar":
      return [
        q("criou o link "),
        b(txt(n["link"]) ?? ""),
        q(` no grupo ${txt(n["grupo"]) ?? ""}${n["restrito"] ? " (restrito)" : ""}`),
      ];
    case "atalho_editar":
      return [
        q("editou o link "),
        b(txt(n["link"]) ?? ""),
        q(` do grupo ${txt(n["grupo"]) ?? ""}${n["restrito"] ? " (restrito)" : ""}`),
      ];
    case "atalho_excluir":
      return [
        q("excluiu o link "),
        b(txt(n["link"]) ?? ""),
        q(` do grupo ${txt(n["grupo"]) ?? ""}`),
      ];
    case "escala_folga_fixa": {
      const dias = Array.isArray(n["dias"]) ? (n["dias"] as number[]) : [];
      return [
        q("definiu a folga fixa de "),
        b(alvo),
        q(
          dias.length
            ? `: ${dias.map((d) => DIAS_DA_SEMANA_AUD[d] ?? "?").join(" e ")}`
            : ": sem folga fixa",
        ),
      ];
    }
    case "escala_troca_aprovar":
    case "escala_troca_recusar":
    case "escala_troca_aplicar": {
      const ini = String(n["inicio"] ?? "");
      // As datas sem repetir e em ordem (a troca de "os dois dias" guarda quatro, em pares).
      const dias = Array.isArray(n["dias"])
        ? [...new Set(n["dias"] as number[])].sort((a, b) => a - b)
        : [];
      const quando = dias
        .map(
          (d) =>
            `${DIAS_DA_SEMANA_AUD[d] ?? "um dia"}, ${dataBRCurta(ini ? somaDias(ini, d) : "")}`,
        )
        .join(" e ");
      return [
        q(
          r.acao === "escala_troca_aprovar"
            ? "aprovou a troca de escala de "
            : r.acao === "escala_troca_aplicar"
              ? "aplicou, ao montar a semana, a troca de escala de "
              : "recusou a troca de escala de ",
        ),
        b(`${txt(n["de"]) ?? ""} e ${txt(n["para"]) ?? ""}`),
        q(`: ${quando}`),
      ];
    }
    case "feriado_marcar":
      return [q("marcou o feriado de "), b(dataBRCurta(n["data"]))];
    case "feriado_tirar":
      return [q("tirou o feriado de "), b(dataBRCurta(n["data"]))];
    default:
      return [q(`registrou a ação "${r.acao}"`), ...(r.alvo ? [q(" sobre "), b(r.alvo)] : [])];
  }
}

/** O que mostrar em "ver detalhes": antes e depois, e o motivo quando houver. */
export function detalhesDoRegistro(r: Registro): Detalhe[] {
  const n = r.valor_novo ?? {};
  const a = r.valor_anterior ?? {};
  const lista: Detalhe[] = [];
  const mudanca = (rotulo: string, chave: string, formatar = txt) => {
    const depois = formatar(n[chave]);
    const antes = formatar(a[chave]);
    if (depois !== null && antes !== depois) lista.push({ rotulo, antes, depois });
  };
  mudanca("Situação", "status");
  mudanca("Prazo de contestação", "prazo_contestacao_ate", dataBR);
  if (r.acao === "registrar_quiz") {
    const antes = a["entregue"] === undefined ? null : a["entregue"] ? "entregue" : "não entregue";
    lista.push({ rotulo: "Quiz", antes, depois: n["entregue"] ? "entregue" : "não entregue" });
  }
  if (r.acao === "registrar_avaliacao") {
    if (n["data_contato"])
      lista.push({ rotulo: "Data do contato", antes: null, depois: dataBR(n["data_contato"])! });
    if (n["processo"])
      lista.push({
        rotulo: "Processo",
        antes: null,
        depois: `${n["processo"]} (versão ${n["processo_versao"]})`,
      });
  }
  if (r.acao === "aceitar_contestacao" && txt(a["nota"]) && txt(n["nota"])) {
    lista.push({ rotulo: "Nota", antes: txt(a["nota"]), depois: txt(n["nota"])! });
  }
  for (const [chave, rotulo] of [
    ["motivo", "Motivo"],
    ["resposta", "Resposta"],
  ] as const) {
    const v = txt(n[chave]);
    if (v) lista.push({ rotulo, antes: null, depois: v });
  }
  const apagados = n["registros_apagados"];
  if (apagados && typeof apagados === "object") {
    const partes = Object.entries(apagados as Record<string, unknown>)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
    if (partes.length)
      lista.push({ rotulo: "Registros apagados", antes: null, depois: partes.join(", ") });
  }
  return lista;
}

/** O horário do fim de semana, no Histórico: "; sábado: das 6h às 15h, com a pausa às 10h". */
function fimDeSemanaNoHistorico(n: Record<string, unknown>): string {
  const dias = Array.isArray(n["fds_dias"]) ? (n["fds_dias"] as number[]) : [];
  if (!dias.length) return "";
  const nomes = dias.map((d) => (d === 5 ? "sábado" : "domingo")).join(" e ");
  return `; ${nomes}: das ${String(n["fds_entrada"])}h às ${String(n["fds_saida"])}h, com a pausa às ${String(n["fds_pausa"])}h`;
}
