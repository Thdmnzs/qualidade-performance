import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORIAS,
  categoriaDe,
  detalhesDoRegistro,
  fraseDoRegistro,
  type Registro,
} from "@/lib/auditoria";
import { dataHoraBR } from "@/lib/format";

const POR_VEZ = 50;
const TODAS = "";
const COR: Record<string, string> = {
  Avaliações: "bg-primary/10 text-primary",
  Contestações: "bg-warning/10 text-warning",
  Quinzenas: "bg-chart-2/10 text-chart-2",
  Sorteios: "bg-chart-5/10 text-chart-5",
  "Acessos e cadastros": "bg-destructive/10 text-destructive",
  Outras: "bg-secondary text-muted-foreground",
};

/** Aba "Auditoria" do Histórico: cada ação registrada, em linguagem clara. Somente leitura. */
export function Auditoria() {
  const [dias, setDias] = useState<string>("30");
  const [categoria, setCategoria] = useState(TODAS);
  const [quem, setQuem] = useState(TODAS);
  const [busca, setBusca] = useState("");
  const [buscaFeita, setBuscaFeita] = useState("");

  // Espera a pessoa parar de digitar antes de buscar.
  useEffect(() => {
    const t = setTimeout(() => setBuscaFeita(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { data: pessoas = [] } = useQuery({
    queryKey: ["auditoria-pessoas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("nome").order("nome");
      if (error) throw error;
      return [...new Set(data.map((e) => e.nome))];
    },
  });

  const consulta = useInfiniteQuery({
    queryKey: ["auditoria", dias, categoria, quem, buscaFeita],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("listar_auditoria", {
        _dias: dias === "tudo" ? null : Number(dias),
        _acoes: categoria ? CATEGORIAS[categoria]! : null,
        _quem: quem || null,
        _busca: buscaFeita.trim() || null,
        _limite: POR_VEZ,
        _deslocamento: pageParam,
      });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (ultima, todas) =>
      ultima.length < POR_VEZ ? undefined : todas.length * POR_VEZ,
  });

  const registros = consulta.data?.pages.flat() ?? [];
  const total = registros[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Filtro id="aud-periodo" rotulo="Período" valor={dias} onChange={setDias}>
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="tudo">Tudo</option>
        </Filtro>
        <Filtro id="aud-categoria" rotulo="Categoria" valor={categoria} onChange={setCategoria}>
          <option value={TODAS}>Todas</option>
          {Object.keys(CATEGORIAS).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Filtro>
        <Filtro id="aud-quem" rotulo="Quem fez" valor={quem} onChange={setQuem}>
          <option value={TODAS}>Todos</option>
          {pessoas.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Filtro>
        <div className="min-w-[200px] flex-1 space-y-1">
          <Label htmlFor="aud-busca" className="text-xs text-muted-foreground">
            Buscar
          </Label>
          <Input
            id="aud-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex.: um nome, um motivo"
          />
        </div>
      </div>

      {consulta.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : registros.length === 0 ? (
        <EmptyState titulo="Nenhum registro" texto="Nenhuma ação registrada com estes filtros." />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {total} {Number(total) === 1 ? "registro" : "registros"} · mostrando {registros.length}
          </p>
          <ul className="space-y-2">
            {registros.map((r) => (
              <LinhaDaAuditoria
                key={r.id}
                quando={r.criado_em}
                registro={{
                  acao: r.acao,
                  quem: r.quem,
                  alvo: r.alvo,
                  valor_anterior: (r.valor_anterior ?? null) as Registro["valor_anterior"],
                  valor_novo: (r.valor_novo ?? null) as Registro["valor_novo"],
                }}
              />
            ))}
          </ul>
          {consulta.hasNextPage && (
            <Button
              variant="outline"
              className="w-full font-bold"
              disabled={consulta.isFetchingNextPage}
              onClick={() => consulta.fetchNextPage()}
            >
              {consulta.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
            </Button>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Os registros da auditoria não podem ser alterados nem apagados por ninguém: só as funções do
        banco escrevem neles.
      </p>
    </div>
  );
}

function LinhaDaAuditoria({ quando, registro }: { quando: string; registro: Registro }) {
  const [aberto, setAberto] = useState(false);
  const categoria = categoriaDe(registro.acao);
  const detalhes = detalhesDoRegistro(registro);
  return (
    <li className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Texto em pedaços: nada do que alguém escreveu é interpretado como HTML. */}
        <p className="text-sm">
          <b>{registro.quem}</b>{" "}
          {fraseDoRegistro(registro).map((p, i) =>
            p.negrito ? <b key={i}>{p.texto}</b> : <span key={i}>{p.texto}</span>,
          )}
        </p>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${COR[categoria] ?? COR["Outras"]}`}
        >
          {categoria}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {dataHoraBR(quando)}
        {detalhes.length > 0 && (
          <>
            {" · "}
            <button
              type="button"
              aria-expanded={aberto}
              onClick={() => setAberto((x) => !x)}
              className="font-bold text-primary hover:underline"
            >
              {aberto ? "ocultar detalhes" : "ver detalhes"}
            </button>
          </>
        )}
      </p>
      {aberto && (
        <dl className="mt-2 space-y-1 rounded-lg bg-secondary px-3 py-2 text-xs">
          {detalhes.map((d) => (
            <div key={d.rotulo} className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{d.rotulo}:</dt>
              <dd>
                {d.antes && (
                  <>
                    <s className="text-muted-foreground">{d.antes}</s> →{" "}
                  </>
                )}
                <b>{d.depois}</b>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function Filtro({
  id,
  rotulo,
  valor,
  onChange,
  children,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </Label>
      <select
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="block h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        {children}
      </select>
    </div>
  );
}
