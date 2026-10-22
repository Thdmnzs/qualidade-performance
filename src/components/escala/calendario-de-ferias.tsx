import { useEffect, useRef, useState } from "react";

import { datasDaSelecao, hojeIso, nomeCurto } from "@/lib/escala";
import type { FeriasDoAno } from "@/lib/escala-api";

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
// As férias em dois tons (22/10/2026): as já tiradas (antes de hoje), mais escuras; as por vir (de hoje em diante), mais claras.
export const FERIAS_TIRADAS = "#D9777A";
export const FERIAS_POR_VIR = "#FBDADA";
const VERDE = "#00E000";
const PEDIDO = "repeating-linear-gradient(45deg, #F4B6B6 0 5px, #FBE1E1 5px 10px)"; // o pedido aguardando, tracejado
const iso = (ano: number, m: number, d: number) =>
  `${ano}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * O calendário do ano: os dias nas linhas, os meses nas colunas. As férias em rosa (as já tiradas mais escuras, as por vir mais claras), os
 * feriados em verde (com "feriado" e o nome, quando os dois coincidem), os livres em cinza.
 * Editável (o ADM): clicar num dia, ou clicar e ARRASTAR para baixo, dentro do mês.
 */
export function CalendarioDeFerias({
  dados,
  destacar = "",
  aoEscolher,
  selecionados = [],
  pedidos = [],
}: {
  dados: FeriasDoAno;
  destacar?: string;
  aoEscolher?: ((datas: string[], ancora: DOMRect) => void) | undefined;
  selecionados?: string[];
  /** Os pedidos aguardando que esta pessoa pode ver: tracejados, com o rótulo ("pedido", ou "Nome?"). */
  pedidos?: { de: string; ate: string; rotulo: string; nome: string }[];
}) {
  const { ano, eu, feriados, porDia } = dados;
  const hoje = hojeIso();
  const busca = destacar.trim().toLowerCase();
  const todos = [...new Set([...porDia.values()].flat().map((p) => p.nome))];
  const [arraste, setArraste] = useState<{ m: number; de: number; ate: number } | null>(null);
  const celulas = useRef(new Map<string, HTMLDivElement>());
  const emSelecao = new Set(
    arraste ? datasDaSelecao(ano, arraste.m, arraste.de, arraste.ate) : selecionados,
  );

  useEffect(() => {
    if (!arraste || !aoEscolher) return;
    const soltar = () => {
      const datas = datasDaSelecao(ano, arraste.m, arraste.de, arraste.ate);
      const ancora = celulas.current
        .get(iso(ano, arraste.m, Math.max(arraste.de, arraste.ate)))
        ?.getBoundingClientRect();
      setArraste(null);
      if (ancora && datas.length) aoEscolher(datas, ancora);
    };
    window.addEventListener("mouseup", soltar);
    return () => window.removeEventListener("mouseup", soltar);
  }, [arraste, ano, aoEscolher]);

  return (
    <table
      className={`w-full table-fixed border-separate [border-spacing:3px] ${arraste ? "cursor-ns-resize select-none" : ""}`}
    >
      <colgroup>
        <col style={{ width: 34 }} />
        {MESES.map((m) => (
          <col key={m} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="text-xs font-medium">dia</th>
          {MESES.map((m) => (
            <th key={m} className="text-xs font-bold">
              {m}/{String(ano).slice(2)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <tr key={d}>
            <td className="text-center text-xs font-bold">{d}</td>
            {MESES.map((_, m) => {
              if (new Date(Date.UTC(ano, m, d)).getUTCMonth() !== m) {
                return (
                  <td
                    key={m}
                    className="rounded-md bg-[repeating-linear-gradient(45deg,transparent_0_4px,var(--border)_4px_5px)]"
                  />
                );
              }
              const data = iso(ano, m, d);
              const pessoas = porDia.get(data) ?? [];
              const feriado = feriados.has(data);
              const pedidosDoDia = pedidos.filter((p) => p.de <= data && data <= p.ate);
              const linhas = [
                ...(feriado ? ["feriado"] : []),
                ...pessoas.map((p) => nomeCurto(p.nome, todos)),
                ...pedidosDoDia.map((p) => p.rotulo),
              ];
              const minha = !!eu && pessoas.some((p) => p.employee_id === eu);
              const achada =
                !!busca &&
                pessoas.some(
                  (p) =>
                    p.nome.toLowerCase().startsWith(busca) ||
                    nomeCurto(p.nome, todos).toLowerCase().startsWith(busca),
                );
              const jaTiradas = data < hoje;
              const fundo = feriado
                ? VERDE
                : pessoas.length
                  ? jaTiradas
                    ? FERIAS_TIRADAS
                    : FERIAS_POR_VIR
                  : undefined;
              const titulo = [
                feriado ? "Feriado" : "",
                pessoas.length
                  ? `Férias${jaTiradas ? " (já tiradas)" : ""}: ${pessoas.map((p) => p.nome).join(" e ")}`
                  : "",
                pedidosDoDia.length
                  ? `Pedido aguardando: ${pedidosDoDia.map((p) => p.nome).join(" e ")}`
                  : "",
                !linhas.length ? "Livre" : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <td key={m}>
                  <div
                    ref={(el) => {
                      if (el) celulas.current.set(data, el);
                    }}
                    title={`${d}/${m + 1}: ${titulo}`}
                    onMouseDown={
                      aoEscolher
                        ? (e) => {
                            e.preventDefault();
                            setArraste({ m, de: d, ate: d });
                          }
                        : undefined
                    }
                    onMouseEnter={
                      aoEscolher
                        ? () => arraste && arraste.m === m && setArraste({ ...arraste, ate: d })
                        : undefined
                    }
                    className={[
                      "flex flex-col items-center justify-center overflow-hidden rounded-md px-0.5 text-center text-[10px] font-bold leading-tight",
                      linhas.length >= 2 ? "min-h-9 py-0.5" : "h-[22px]",
                      fundo ? "text-[#0D0F0D]" : "bg-secondary",
                      aoEscolher
                        ? "cursor-pointer hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-[#2563EB]"
                        : "",
                      emSelecao.has(data)
                        ? "outline outline-2 -outline-offset-2 outline-[#2563EB] brightness-95"
                        : "",
                      minha ? "shadow-[inset_0_0_0_2px] shadow-primary" : "",
                      achada ? "shadow-[inset_0_0_0_2px] shadow-[#2563EB]" : "",
                      busca && !achada ? "opacity-35" : "",
                      data === hoje
                        ? "outline-dashed outline-2 outline-offset-1 outline-[#2563EB]"
                        : "",
                      pedidosDoDia.length
                        ? "text-[#0D0F0D] outline-dashed outline-2 -outline-offset-2 outline-[#C2410C]"
                        : "",
                    ].join(" ")}
                    style={
                      fundo
                        ? { background: fundo }
                        : pedidosDoDia.length
                          ? { background: PEDIDO }
                          : undefined
                    }
                  >
                    {linhas.map((x, k) => (
                      <span key={k} className="max-w-full truncate">
                        {x}
                      </span>
                    ))}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LegendaDasFerias({
  comMinhas,
  pedidos,
}: {
  comMinhas: boolean;
  pedidos?: "meus" | "todos" | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span
        className="rounded-full px-2.5 py-1 font-bold text-[#0D0F0D]"
        style={{ background: FERIAS_TIRADAS }}
      >
        Férias já tiradas
      </span>
      <span
        className="rounded-full px-2.5 py-1 font-bold text-[#0D0F0D]"
        style={{ background: FERIAS_POR_VIR }}
      >
        Férias por vir
      </span>
      <span
        className="rounded-full px-2.5 py-1 font-bold text-[#0D0F0D]"
        style={{ background: VERDE }}
      >
        Feriado
      </span>
      {pedidos && (
        <span
          className="rounded-full px-2.5 py-1 font-bold text-[#0D0F0D] outline-dashed outline-2 -outline-offset-2 outline-[#C2410C]"
          style={{ background: PEDIDO }}
        >
          {pedidos === "meus" ? "Seu pedido aguardando" : "Pedido aguardando"}
        </span>
      )}
      <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
        Livre (ninguém escolheu)
      </span>
      {comMinhas && (
        <span className="rounded-full px-2.5 py-1 font-bold shadow-[inset_0_0_0_2px] shadow-primary">
          Suas férias
        </span>
      )}
      <span className="rounded-full px-2.5 py-1 outline-dashed outline-2 -outline-offset-2 outline-[#2563EB]">
        Hoje
      </span>
    </div>
  );
}
