import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { CartaoIndicador } from "@/components/cartao-indicador";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Label } from "@/components/ui/label";
import { useCurrentEmployee, usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { dataBR, nomeQuinzena } from "@/lib/format";
import {
  atingiuMeta,
  formatarValor,
  INDICADORES,
  mediaSemanal,
  nivelQualidade,
  QUALIDADE_MINIMA,
  textoDaMeta,
  type ChaveIndicador,
  textoDaSituacao,
  variacao,
  type Variacao,
} from "@/lib/indicadores";
import {
  fetchElegibilidade,
  fetchMediasTime,
  fetchMetas,
  fetchQuinzenas,
  fetchResultados,
} from "@/lib/queries";
import { quinzenasPublicadas, situacaoExibida } from "@/lib/quinzena";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Visão geral · QualityHUB" },
      { name: "description", content: "Seus indicadores e elegibilidade na quinzena." },
    ],
  }),
  component: Painel,
});

type Linha = { rotulo: string; valor: string };
type Cartao = {
  chave: string;
  titulo: string;
  etiqueta: "individual" | "do time";
  /** Valor principal já formatado, ou null enquanto não há resultado. */
  valor: string | null;
  /** true = na meta; false = fora da meta; null = aguardando. */
  naMeta: boolean | null;
  sentido: "minimo" | "maximo";
  meta: string;
  /** Nível de qualidade (5G, 4G...), mostrado na pílula. */
  nivel?: string;
  variacao: Variacao | null;
  /** Valor da quinzena anterior, já formatado. */
  anterior: string | null;
};

function Painel() {
  const { data: employee, isLoading: carregandoEmp } = useCurrentEmployee();
  const { temAreaDeColaborador, isLoading: carregandoPerfil } = usePermissoes();
  const [fortnightId, setFortnightId] = useState("");

  // Só as quinzenas publicadas: antes disso não há nada para o colaborador ver.
  const { data: quinzenas = [] } = useQuery({ queryKey: ["quinzenas"], queryFn: fetchQuinzenas });
  const publicadas = quinzenasPublicadas(quinzenas);
  useEffect(() => {
    if (!fortnightId && publicadas[0]) setFortnightId(publicadas[0].id);
  }, [publicadas, fortnightId]);
  const quinzena = publicadas.find((q) => q.id === fortnightId);
  // A quinzena publicada anterior, para a variação ("quinz. ant.").
  const quinzenaAnterior = publicadas[publicadas.findIndex((q) => q.id === fortnightId) + 1];
  const anteriorId = quinzenaAnterior?.id ?? "";
  const employeeId = employee?.id;

  const { data: metas = {} } = useQuery({ queryKey: ["metas-indicadores"], queryFn: fetchMetas });
  const { data: resultados = [] } = useQuery({
    queryKey: ["resultados", fortnightId, employeeId],
    queryFn: () => fetchResultados(fortnightId, employeeId!),
    enabled: !!fortnightId && !!employeeId,
  });
  const { data: medias = [] } = useQuery({
    queryKey: ["medias", fortnightId],
    queryFn: () => fetchMediasTime(fortnightId),
    enabled: !!fortnightId,
  });
  const { data: qualidade } = useQuery({
    queryKey: ["qualidade", fortnightId, employeeId],
    enabled: !!fortnightId && !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("qualidade_da_quinzena", {
        _fortnight_id: fortnightId,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const { data: resultadosAnt = [] } = useQuery({
    queryKey: ["resultados", anteriorId, employeeId],
    queryFn: () => fetchResultados(anteriorId, employeeId!),
    enabled: !!anteriorId && !!employeeId,
  });
  const { data: mediasAnt = [] } = useQuery({
    queryKey: ["medias", anteriorId],
    queryFn: () => fetchMediasTime(anteriorId),
    enabled: !!anteriorId,
  });
  const { data: qualidadeAnt } = useQuery({
    queryKey: ["qualidade", anteriorId, employeeId],
    enabled: !!anteriorId && !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("qualidade_da_quinzena", {
        _fortnight_id: anteriorId,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const { data: elegibilidade } = useQuery({
    queryKey: ["elegibilidade", fortnightId, employeeId],
    queryFn: () => fetchElegibilidade(fortnightId, employeeId!),
    enabled: !!fortnightId && !!employeeId,
  });
  const motivos = Array.isArray(elegibilidade?.motivos) ? (elegibilidade?.motivos as string[]) : [];

  if (carregandoEmp || carregandoPerfil)
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!temAreaDeColaborador) {
    return (
      <EmptyState
        titulo="Área do colaborador"
        texto="O perfil ADM não tem indicadores próprios. Use a Visão geral para acompanhar o time."
      />
    );
  }
  if (!employee) {
    return (
      <EmptyState
        titulo="Cadastro não vinculado"
        texto="Seu acesso ainda não está vinculado a um colaborador. Procure a administração."
      />
    );
  }

  const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const valorDe = (chave: ChaveIndicador, lista = resultados) =>
    numero(lista.find((x) => x.indicador === chave)?.valor);
  const mediaDe = (chave: ChaveIndicador, lista = medias) =>
    numero(lista.find((x) => x.indicador === chave)?.media);

  const cartoes: Cartao[] = [];

  // Qualidade: vem das avaliações (nota da quinzena = média das notas).
  const nota = numero(qualidade?.minha_nota);
  const notaAnt = numero(qualidadeAnt?.minha_nota);
  cartoes.push({
    chave: "qualidade",
    titulo: "Qualidade",
    etiqueta: "individual",
    valor: nota === null ? null : formatarValor("qualidade", nota),
    naMeta: nota === null ? null : nota >= QUALIDADE_MINIMA,
    sentido: "minimo",
    meta: `mínimo ${QUALIDADE_MINIMA} (nível 4G)`,
    ...(nota === null ? {} : { nivel: nivelQualidade(nota) }),
    variacao: variacao("qualidade", nota, notaAnt, "minimo"),
    anterior: notaAnt === null ? null : formatarValor("qualidade", notaAnt),
  });

  for (const ind of INDICADORES) {
    const meta = metas[ind.chave];
    if (!meta) continue;
    const doTime = ind.chave === "csat"; // CSAT é do time: o mesmo valor para todos
    const atual = doTime ? mediaDe(ind.chave) : valorDe(ind.chave);
    const ant = doTime ? mediaDe(ind.chave, mediasAnt) : valorDe(ind.chave, resultadosAnt);
    let medidoNaMeta = atual;
    if (ind.chave === "horas_online") {
      // A regra da meta usa a média semanal da quinzena; a variação também.
      medidoNaMeta = atual === null || !quinzena ? null : mediaSemanal(atual, quinzena);
      const antSemanal =
        ant === null || !quinzenaAnterior ? null : mediaSemanal(ant, quinzenaAnterior);
      cartoes.push({
        chave: ind.chave,
        titulo: ind.titulo,
        etiqueta: "individual",
        valor: atual === null ? null : formatarValor("horas_online", atual),
        naMeta: medidoNaMeta === null ? null : atingiuMeta(meta, medidoNaMeta),
        sentido: meta.sentido,
        meta: `${meta.meta}h/semana`,
        variacao: variacao("horas_online", medidoNaMeta, antSemanal, meta.sentido),
        anterior: ant === null ? null : formatarValor("horas_online", ant),
      });
      continue;
    }
    cartoes.push({
      chave: ind.chave,
      titulo: ind.titulo,
      etiqueta: doTime ? "do time" : "individual",
      valor: atual === null ? null : formatarValor(ind.chave, atual),
      naMeta: medidoNaMeta === null ? null : atingiuMeta(meta, medidoNaMeta),
      sentido: meta.sentido,
      meta: textoDaMeta(meta),
      variacao: variacao(ind.chave, atual, ant, meta.sentido),
      anterior: ant === null ? null : formatarValor(ind.chave, ant),
    });
  }

  return (
    <div>
      <PageHeader
        titulo={`Olá, ${employee.nome.split(" ")[0]}`}
        descricao={
          quinzena
            ? `${nomeQuinzena(quinzena)} · ${situacaoExibida(quinzena, 0).rotulo} · ${dataBR(quinzena.data_inicio)} a ${dataBR(quinzena.data_fim)}`
            : "Seus indicadores aparecem aqui quando a quinzena é publicada."
        }
      />

      {publicadas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma quinzena publicada ainda"
          texto="Quando a administração publicar a quinzena, seus indicadores e avaliações aparecem aqui."
        />
      ) : (
        <>
          {publicadas.length > 1 && (
            <div className="mb-6 space-y-1">
              <Label htmlFor="painel-quinzena" className="text-xs text-muted-foreground">
                Quinzena
              </Label>
              <select
                id="painel-quinzena"
                value={fortnightId}
                onChange={(e) => setFortnightId(e.target.value)}
                className="block h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {publicadas.map((q) => (
                  <option key={q.id} value={q.id}>
                    {nomeQuinzena(q)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-8 rounded-2xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Elegibilidade à premiação
            </p>
            {elegibilidade ? (
              <>
                <p
                  className={`mt-2 inline-flex items-center gap-2 font-display text-xl font-bold ${
                    elegibilidade.elegivel ? "text-primary" : "text-destructive"
                  }`}
                >
                  {elegibilidade.elegivel ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <AlertTriangle className="size-5" />
                  )}
                  {elegibilidade.elegivel ? "Elegível" : "Não elegível"}
                </p>
                {motivos.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {motivos.map((m, i) => (
                      <li key={i}>• {m}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Calculada no fechamento da quinzena.
              </p>
            )}
          </div>

          <h2 className="mb-3 font-display text-lg font-semibold">Meus indicadores</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cartoes.map((c) => (
              <CartaoIndicador
                key={c.chave}
                rotulo={c.titulo}
                etiqueta={c.etiqueta}
                valor={c.valor}
                variacao={c.variacao}
                // Sem quinzena anterior, o rodapé não mostra "quinz. ant.".
                {...(quinzenaAnterior ? { anterior: c.anterior } : {})}
                situacao={c.naMeta === null ? "aguardando" : c.naMeta ? "ok" : "fora"}
                textoDaSituacao={`${textoDaSituacao(c.naMeta, c.sentido)}${c.nivel ? ` · ${c.nivel}` : ""}`}
                meta={c.meta}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
