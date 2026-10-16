import type { Variacao } from "@/lib/indicadores";

/**
 * Cartão de indicador no formato do painel de referência: rótulo e etiqueta,
 * valor com a variação, e no rodapé o valor anterior e a pílula da situação.
 * As cores ficam em styles.css (.cartao-ind) e seguem a situação: preto e
 * vermelho fora da meta; branco, preto e verde dentro da meta.
 */
export function CartaoIndicador({
  rotulo,
  etiqueta,
  valor,
  variacao,
  anterior,
  situacao,
  textoDaSituacao,
  meta,
  descricao,
  legenda,
  ontem,
  children,
}: {
  rotulo: string;
  etiqueta: "individual" | "do time" | "sem meta";
  /** Valor já formatado, ou null enquanto não há resultado. */
  valor: string | null;
  variacao?: Variacao | null;
  /** Valor da quinzena anterior, já formatado ("—" quando não há). */
  anterior?: string | null;
  /** "info": um indicador informativo, sem meta (a borda tracejada e a pílula azul). */
  situacao: "ok" | "fora" | "aguardando" | "info";
  textoDaSituacao: string;
  /** Texto da meta, mostrado ao passar o mouse sobre a pílula. */
  meta?: string;
  /** O que o indicador mede, em linguagem simples (na legenda do ícone de ?). */
  descricao?: string;
  /** Uma linha embaixo do valor (por exemplo, "na quinzena, até ontem"). */
  legenda?: string;
  /** O número do dia anterior (o D-1), já formatado; null num dia sem dados (a folga). */
  ontem?: { rotulo: string; valor: string | null; naMeta: boolean | null };
  children?: React.ReactNode;
}) {
  return (
    // Preto só quando o indicador está FORA da meta: o cartão escuro é um alerta.
    // Vermelho claro só quando o indicador está FORA da meta (o cartão é um alerta); tracejado quando é informativo.
    <div
      className={`cartao-ind ${situacao === "fora" ? "escuro" : situacao === "info" ? "info" : "claro"} ${situacao}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="rotulo">{rotulo}</span>
          {descricao && <Ajuda rotulo={rotulo} texto={descricao} escuro={false} />}
        </span>
        <span
          className={`etiqueta ${etiqueta === "do time" ? "time" : etiqueta === "sem meta" ? "info" : "individual"}`}
        >
          {etiqueta}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {valor === null ? (
          <span className="valor aguardando">Aguardando o resultado</span>
        ) : (
          <span className="valor">{valor}</span>
        )}
        {variacao && (
          <span
            className="delta"
            aria-label={`Em relação à quinzena anterior: ${variacao.texto}${variacao.bom === null ? "" : variacao.bom ? ", melhorou" : ", piorou"}`}
          >
            {variacao.texto}
          </span>
        )}
      </div>
      {legenda && <p className="-mt-1.5 text-[11px] font-semibold opacity-70">{legenda}</p>}
      {ontem && (
        <div
          className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs ${situacao === "fora" ? "bg-white/10" : "bg-black/[0.04] dark:bg-white/[0.06]"}`}
        >
          <span>{ontem.rotulo}</span>
          <b
            className={
              ontem.naMeta === null
                ? ""
                : ontem.naMeta
                  ? situacao === "fora"
                    ? "text-[#3ee07a]"
                    : "text-[#157a3a] dark:text-[#3ee07a]"
                  : situacao === "fora"
                    ? "text-[#ff6b6b]"
                    : "text-[#d93025]"
            }
          >
            {ontem.valor ?? "folga"}
          </b>
        </div>
      )}
      {children}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="anterior">
          {anterior !== undefined && (
            <>
              quinz. ant.: <b>{anterior ?? "—"}</b>
            </>
          )}
        </span>
        <span className={`pilula ${situacao}`} title={meta ? `Meta: ${meta}` : undefined}>
          {textoDaSituacao}
        </span>
      </div>
    </div>
  );
}

/**
 * O ícone de ? com a legenda do indicador: abre ao passar o mouse e com o teclado (o foco), e o leitor de
 * tela também a lê (aria-describedby). Num cartão escuro, a legenda fica clara.
 */
function Ajuda({ rotulo, texto, escuro }: { rotulo: string; texto: string; escuro: boolean }) {
  const id = `legenda-${rotulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`O que é ${rotulo}?`}
        aria-describedby={id}
        className="flex size-[18px] items-center justify-center rounded-full border border-current text-[11px] font-bold leading-none opacity-60 hover:opacity-100 focus-visible:opacity-100"
      >
        ?
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none invisible absolute bottom-[calc(100%+8px)] left-1/2 z-20 w-max max-w-60 -translate-x-1/2 rounded-lg px-2.5 py-2 text-xs font-medium normal-case leading-snug tracking-normal opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${escuro ? "bg-[#f1f3f1] text-[#111311]" : "bg-[#111311] text-white dark:bg-[#f1f3f1] dark:text-[#111311]"}`}
      >
        {texto}
      </span>
    </span>
  );
}
