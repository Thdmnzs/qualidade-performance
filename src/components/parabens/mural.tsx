import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { lerMeusRecados, ocultarRecado } from "@/lib/parabens-api";

const chave = (employeeId: string) => `qh:mural-dos-parabens:${employeeId}`;
const lerMinimizado = (employeeId: string, padrao: boolean) => {
  try {
    const v = window.localStorage.getItem(chave(employeeId));
    return v === null ? padrao : v === "1";
  } catch {
    return padrao;
  }
};

/**
 * "Seus parabéns": os recados do ano, guardados só para a pessoa. No dia do aniversário, o
 * mural abre; nos outros dias, começa minimizado. A escolha de minimizar fica no navegador.
 * Sem a contagem dos recados (ela vira comparação).
 */
export function MuralDosParabens({
  employeeId,
  aniversarioHoje,
}: {
  employeeId: string;
  aniversarioHoje: boolean;
}) {
  const qc = useQueryClient();
  const { data: recados = [] } = useQuery({ queryKey: ["meus-parabens"], queryFn: lerMeusRecados });
  const [minimizado, setMinimizado] = useState(() => lerMinimizado(employeeId, !aniversarioHoje));
  if (!recados.length) return null;
  const alternar = () => {
    const novo = !minimizado;
    setMinimizado(novo);
    try {
      window.localStorage.setItem(chave(employeeId), novo ? "1" : "0");
    } catch {
      // sem o navegador para guardar, vale só nesta visita
    }
  };
  async function ocultar(id: string) {
    if (!window.confirm("Ocultar este recado do seu mural? Ele é apagado, e não volta.")) return;
    try {
      await ocultarRecado(id);
      await qc.invalidateQueries({ queryKey: ["meus-parabens"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">
          💌 {aniversarioHoje ? "Seus parabéns de hoje" : "Seus parabéns"}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">Só você vê os recados.</p>
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!minimizado}
            aria-controls="recados-dos-parabens"
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-bold"
          >
            {minimizado ? "Mostrar os recados" : "Minimizar"}
            <ChevronDown
              className={`size-3.5 transition-transform ${minimizado ? "" : "rotate-180"}`}
              strokeWidth={3}
            />
          </button>
        </div>
      </div>
      {!minimizado && (
        <ul id="recados-dos-parabens" className="mt-3 space-y-2">
          {recados.map((r) => (
            <li key={r.id} className="flex gap-3 rounded-xl border border-border p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-xs font-bold">
                {r.autor.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <b>{r.autor}</b>{" "}
                  <span className="text-xs text-muted-foreground">
                    ·{" "}
                    {new Date(r.criado_em).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Fortaleza",
                    })}
                  </span>
                </p>
                {/* O recado é mostrado como TEXTO (nunca como código), como todo texto vindo de uma pessoa. */}
                <p className="whitespace-pre-wrap break-words text-sm">{r.texto}</p>
              </div>
              <button
                type="button"
                onClick={() => ocultar(r.id)}
                className="self-start text-[11px] text-muted-foreground underline"
                aria-label={`Ocultar o recado de ${r.autor}`}
              >
                Ocultar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
