import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useEffect, useState } from "react";

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
      { title: "Visão geral · Qualidade & Performance" },
      { name: "description", content: "Seus indicadores e elegibilidade na quinzena." },
    ],
  }),
  component: Painel,
});

type Linha = { rotulo: string; valor: string };
type Cartao = {
  chave: string;
  titulo: string;
  /** Valor principal já formatado, ou null enquanto não há resultado. */
  valor: string | null;
  selo?: string;
  /** true = na meta; false = fora da meta; null = aguardando. */
  naMeta: boolean | null;
  meta: string;
  linhas: Linha[];
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

  const valorDe = (chave: ChaveIndicador) => {
    const r = resultados.find((x) => x.indicador === chave);
    return r?.valor === null || r?.valor === undefined ? null : Number(r.valor);
  };
  const mediaDe = (chave: ChaveIndicador) => {
    const m = medias.find((x) => x.indicador === chave);
    return m?.media === null || m?.media === undefined ? null : Number(m.media);
  };

  const cartoes: Cartao[] = [];

  // Qualidade: vem das avaliações (nota da quinzena = média das notas).
  const nota =
    qualidade?.minha_nota === null || qualidade?.minha_nota === undefined
      ? null
      : Number(qualidade.minha_nota);
  cartoes.push({
    chave: "qualidade",
    titulo: "Qualidade",
    valor: nota === null ? null : formatarValor("qualidade", nota),
    // O selo só existe quando há nota (o campo é omitido, e não "undefined").
    ...(nota === null ? {} : { selo: nivelQualidade(nota) }),
    naMeta: nota === null ? null : nota >= QUALIDADE_MINIMA,
    meta: `mínimo ${QUALIDADE_MINIMA} (nível 4G)`,
    linhas: [
      { rotulo: "Avaliações na quinzena", valor: String(qualidade?.minhas_avaliacoes ?? 0) },
      {
        rotulo: "Média do time",
        valor:
          qualidade?.media_time === null || qualidade?.media_time === undefined
            ? "—"
            : formatarValor("qualidade", Number(qualidade.media_time)),
      },
    ],
  });

  for (const ind of INDICADORES) {
    const meta = metas[ind.chave];
    if (!meta) continue;
    const media = mediaDe(ind.chave);

    if (ind.chave === "csat") {
      // CSAT é do time: o valor é a média do time, igual para todos.
      cartoes.push({
        chave: ind.chave,
        titulo: ind.titulo,
        valor: media === null ? null : formatarValor("csat", media),
        naMeta: media === null ? null : atingiuMeta(meta, media),
        meta: textoDaMeta(meta),
        linhas: [],
      });
      continue;
    }

    const valor = valorDe(ind.chave);
    if (ind.chave === "horas_online") {
      // O cartão mostra só as horas logadas e a meta; o selo segue a regra
      // registrada (média semanal da quinzena >= meta).
      const semanal = valor === null || !quinzena ? null : mediaSemanal(valor, quinzena);
      cartoes.push({
        chave: ind.chave,
        titulo: ind.titulo,
        valor: valor === null ? null : formatarValor("horas_online", valor),
        naMeta: semanal === null ? null : atingiuMeta(meta, semanal),
        meta: `${meta.meta}h/semana`,
        linhas: [],
      });
      continue;
    }

    cartoes.push({
      chave: ind.chave,
      titulo: ind.titulo,
      valor: valor === null ? null : formatarValor(ind.chave, valor),
      naMeta: valor === null ? null : atingiuMeta(meta, valor),
      meta: textoDaMeta(meta),
      linhas: [
        { rotulo: "Média do time", valor: media === null ? "—" : formatarValor(ind.chave, media) },
      ],
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
              <CartaoIndicador key={c.chave} cartao={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CartaoIndicador({ cartao: c }: { cartao: Cartao }) {
  const borda =
    c.naMeta === null ? "border-border" : c.naMeta ? "border-primary/40" : "border-destructive/40";
  return (
    <div className={`flex flex-col rounded-2xl border bg-card p-5 ${borda}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{c.titulo}</p>
        {c.naMeta === null ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> Aguardando
          </span>
        ) : c.naMeta ? (
          <span className="flex items-center gap-1 text-xs font-medium text-primary">
            <CheckCircle2 className="size-3.5" /> Na meta
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle className="size-3.5" /> Fora da meta
          </span>
        )}
      </div>

      <p className="mt-2 font-display text-3xl font-bold">
        {c.valor ?? (
          <span className="text-xl font-normal text-muted-foreground">Aguardando o resultado</span>
        )}
        {c.selo && <span className="ml-2 text-lg font-semibold text-primary">— {c.selo}</span>}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Meta: {c.meta}</p>

      {c.linhas.length > 0 && (
        <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
          {c.linhas.map((l) => (
            <div key={l.rotulo} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{l.rotulo}</dt>
              <dd className="text-right">{l.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
