import type { Variacao } from "@/lib/indicadores";

/**
 * Cartão de indicador no formato do painel de referência: rótulo e etiqueta,
 * valor com a variação, e no rodapé o valor anterior e a pílula da situação.
 * As cores ficam em styles.css (.cartao-ind); aqui só se escolhem as variantes.
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
  escuro = false,
  children,
}: {
  rotulo: string;
  etiqueta: "individual" | "do time";
  /** Valor já formatado, ou null enquanto não há resultado. */
  valor: string | null;
  variacao?: Variacao | null;
  /** Valor da quinzena anterior, já formatado ("—" quando não há). */
  anterior?: string | null;
  situacao: "ok" | "fora" | "aguardando";
  textoDaSituacao: string;
  /** Texto da meta, mostrado ao passar o mouse sobre a pílula. */
  meta?: string;
  escuro?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`cartao-ind ${escuro ? "escuro" : "claro"} ${situacao === "fora" ? "fora" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rotulo">{rotulo}</span>
        <span className={`etiqueta ${etiqueta === "do time" ? "time" : "individual"}`}>
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
            className={`delta ${variacao.bom === null ? "igual" : variacao.bom ? "bom" : "mau"}`}
            aria-label={`Em relação à quinzena anterior: ${variacao.texto}${variacao.bom === null ? "" : variacao.bom ? ", melhorou" : ", piorou"}`}
          >
            {variacao.texto}
          </span>
        )}
      </div>
      {children}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="anterior">
          {anterior !== undefined ? `quinz. ant.: ${anterior ?? "—"}` : ""}
        </span>
        <span className={`pilula ${situacao}`} title={meta ? `Meta: ${meta}` : undefined}>
          {textoDaSituacao}
        </span>
      </div>
    </div>
  );
}
