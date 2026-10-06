import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { linkSeguroDoNotion } from "@/lib/notion";

export type ProcessoEscolhido = {
  id: string;
  codigo: string | null;
  titulo: string;
  versao: number;
};
type Achado = {
  id: string;
  codigo: string | null;
  titulo: string;
  base: string;
  revisado: boolean;
  versao: number;
  url: string;
};

async function buscar(texto: string, limite: number): Promise<Achado[]> {
  if (texto.trim().length < 2) return [];
  const { data, error } = await supabase.rpc("buscar_processos", {
    _texto: texto,
    _limite: limite,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * Processo da Flukepédia relacionado ao contato. Mostra só o nome e o link
 * para o Notion (a consulta é feita lá) e deixa marcar o processo usado, que
 * fica guardado na avaliação junto com a versão.
 */
export function ProcessoRelacionado({
  consulta,
  escolhido,
  onEscolher,
}: {
  /** Texto do contato: assunto, classificação e a primeira mensagem do cliente. */
  consulta: string;
  escolhido: ProcessoEscolhido | null;
  onEscolher: (p: ProcessoEscolhido | null) => void;
}) {
  const [termo, setTermo] = useState("");
  const [termoBuscado, setTermoBuscado] = useState("");

  // Espera a pessoa parar de digitar antes de buscar (evita um pedido por tecla).
  useEffect(() => {
    const t = setTimeout(() => setTermoBuscado(termo), 300);
    return () => clearTimeout(t);
  }, [termo]);

  const { data: sugeridos = [] } = useQuery({
    queryKey: ["processos-sugeridos", consulta],
    queryFn: () => buscar(consulta, 3),
    enabled: consulta.trim().length >= 2,
  });
  const { data: encontrados = [] } = useQuery({
    queryKey: ["processos-busca", termoBuscado],
    queryFn: () => buscar(termoBuscado, 8),
    enabled: termoBuscado.trim().length >= 2,
  });
  const outros = encontrados.filter((p) => !sugeridos.some((s) => s.id === p.id));

  const linha = (p: Achado) => {
    const marcado = escolhido?.id === p.id;
    const link = linkSeguroDoNotion(p.url);
    return (
      <div
        key={p.id}
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {p.codigo ? `${p.codigo} · ` : ""}
            {p.titulo}
          </p>
          <p
            className={`text-xs ${p.revisado || p.base === "Guia" ? "text-primary" : "text-warning"}`}
          >
            {p.base === "Guia"
              ? "guia"
              : p.revisado
                ? "revisado pela Qualidade"
                : "ainda não revisado pela Qualidade"}{" "}
            · versão {p.versao}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Abrir no Notion <ExternalLink className="size-3" />
            </a>
          )}
          <button
            type="button"
            aria-pressed={marcado}
            onClick={() =>
              onEscolher(
                marcado ? null : { id: p.id, codigo: p.codigo, titulo: p.titulo, versao: p.versao },
              )
            }
            className={`rounded-full px-3 py-1 text-xs font-medium ${marcado ? "bg-primary text-primary-foreground" : "border border-border"}`}
          >
            {marcado ? "✓ Usado nesta avaliação" : "Usar nesta avaliação"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5"
      aria-label="Processo relacionado"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Processo relacionado</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Sugeridos pelo assunto, pela classificação e pela primeira mensagem do cliente. Para
        consultar o processo, abra no Notion.
      </p>
      <div className="mt-3 space-y-2">
        {consulta.trim().length < 2 ? (
          <p className="text-xs text-muted-foreground">
            Sorteie ou busque um contato para ver sugestões.
          </p>
        ) : sugeridos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma sugestão para este contato. Use a busca.
          </p>
        ) : (
          sugeridos.map(linha)
        )}
      </div>
      <div className="mt-3 space-y-1">
        <Label htmlFor="busca-processo" className="text-xs text-muted-foreground">
          Ou procure por nome ou código
        </Label>
        <Input
          id="busca-processo"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Ex.: chip, portabilidade, B2C-CNT"
        />
      </div>
      {termoBuscado.trim().length >= 2 && (
        <div className="mt-2 space-y-2">
          {outros.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum outro processo encontrado.</p>
          ) : (
            outros.map(linha)
          )}
        </div>
      )}
      {escolhido && (
        <p className="mt-4 rounded-lg border-l-4 border-primary bg-primary/10 px-3 py-2 text-xs">
          Processo usado nesta avaliação: {escolhido.codigo ? `${escolhido.codigo} · ` : ""}
          {escolhido.titulo} (versão {escolhido.versao}). Ele fica guardado junto com a avaliação.
        </p>
      )}
    </section>
  );
}
