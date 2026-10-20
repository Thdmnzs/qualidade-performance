import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { MeuDia } from "@/components/escala/semana-do-time";
import { dataDoDia, hojeIso, segundaDaSemana, type Sigla } from "@/lib/escala";
import { lerSemana, lerSiglas } from "@/lib/escala-api";

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * O "Meu dia" na Visão geral (20/10/2026): o turno de hoje, pela escala publicada (com as trocas e as
 * férias já aplicadas pelo banco), e o atalho para a escala completa.
 */
export function MeuDiaNaVisaoGeral() {
  const hoje = hojeIso();
  const inicio = segundaDaSemana(hoje);
  const { data: semana, isLoading } = useQuery({
    queryKey: ["escala-semana", inicio],
    queryFn: () => lerSemana(inicio),
  });
  const { data: siglas = [] } = useQuery({ queryKey: ["escala-siglas"], queryFn: lerSiglas });
  const indice = Array.from({ length: 7 }, (_, i) => dataDoDia(inicio, i)).indexOf(hoje);
  const linha = semana?.dias[indice]?.find((l) => l.employee_id === semana.eu);
  const publicada = semana?.situacao === "publicada";
  const nomeDoDia = SEMANA[new Date(`${hoje}T12:00:00Z`).getUTCDay()];
  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="Meu dia">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        📅 Meu dia · {nomeDoDia}, {hoje.slice(8)}/{hoje.slice(5, 7)}
      </p>
      <div className="mt-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando a escala...</p>
        ) : !publicada ? (
          <p className="text-sm text-muted-foreground">
            A escala desta semana ainda não foi publicada.
          </p>
        ) : (
          <MeuDia
            linha={linha}
            siglas={new Map<string, Sigla>(siglas.map((s) => [s.id, s]))}
            feriado={(semana?.feriados ?? []).includes(hoje)}
          />
        )}
      </div>
      <Link
        to="/escala"
        className="mt-4 inline-block text-sm font-bold text-primary hover:underline"
      >
        Ver a escala completa →
      </Link>
    </section>
  );
}
