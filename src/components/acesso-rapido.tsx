import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink, Link2, Pencil, Star } from "lucide-react";
import { useEffect, useState } from "react";

import { lerAcessoRapido } from "@/lib/acesso-rapido-api";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  buscarAtalhos,
  gruposVisiveis,
  lerAtalhos,
  salvarAtalhos,
  type Atalho,
} from "@/lib/acesso-rapido";

/**
 * O acesso rápido (14/10/2026): os links das ferramentas do time, embaixo do menu. Os grupos abrem e
 * fecham (o Atendimento começa aberto, e os slides são um subgrupo recolhível); a estrela fixa um link
 * em "Meus atalhos", no topo; e a busca procura em todos os grupos. Os links abrem numa aba nova.
 */
export function AcessoRapido({
  perfil,
  pessoa,
}: {
  perfil: string | null | undefined;
  pessoa: string | null | undefined;
}) {
  // A lista mora no banco (o ADM a edita); os restritos só chegam ao ADM.
  const { data } = useQuery({
    queryKey: ["acesso-rapido"],
    queryFn: lerAcessoRapido,
    enabled: !!pessoa,
    staleTime: 5 * 60_000,
  });
  const grupos = gruposVisiveis(perfil, data ?? []);
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(["Atendimento"]));
  const [atalhos, setAtalhos] = useState<string[]>([]);
  useEffect(() => setAtalhos(pessoa ? lerAtalhos(pessoa) : []), [pessoa]);
  const alternar = (id: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const fixar = (url: string) => {
    const novos = atalhos.includes(url) ? atalhos.filter((x) => x !== url) : [...atalhos, url];
    setAtalhos(novos);
    if (pessoa) salvarAtalhos(pessoa, novos);
  };
  const todos = grupos.flatMap((g) => g.links);
  const meus = atalhos.map((u) => todos.find((l) => l.url === u)).filter((l): l is Atalho => !!l);
  const achados = buscarAtalhos(grupos, busca);
  const Link_ = ({
    l,
    recuo = "pl-7",
    prefixo,
  }: {
    l: Atalho;
    recuo?: string;
    prefixo?: string;
  }) => {
    const fixado = atalhos.includes(l.url);
    return (
      <div className={`group flex items-center gap-1 rounded-md pr-1 hover:bg-secondary ${recuo}`}>
        <a
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-[12.5px]"
          title={l.nome}
        >
          <span className="truncate">
            {prefixo && <span className="text-muted-foreground">{prefixo} · </span>}
            {l.nome}
          </span>
          {l.restrito && (
            <span className="shrink-0 rounded-full bg-destructive/15 px-1.5 text-[9.5px] font-bold text-destructive">
              restrito
            </span>
          )}
          <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={() => fixar(l.url)}
          aria-label={fixado ? `Tirar ${l.nome} dos atalhos` : `Fixar ${l.nome} nos atalhos`}
          aria-pressed={fixado}
          className={`shrink-0 rounded p-0.5 ${fixado ? "text-warning" : "text-muted-foreground opacity-0 focus:opacity-100 group-hover:opacity-100"}`}
        >
          <Star className={`size-3.5 ${fixado ? "fill-current" : ""}`} />
        </button>
      </div>
    );
  };
  const Grupo = ({
    id,
    rotulo,
    quantos,
    aberto,
    children,
  }: {
    id: string;
    rotulo: React.ReactNode;
    quantos: number;
    aberto: boolean;
    children: React.ReactNode;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => alternar(id)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[13px] font-bold hover:bg-secondary"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{rotulo}</span>
        <span className="text-[10.5px] text-muted-foreground">{quantos}</span>
      </button>
      {aberto && children}
    </div>
  );
  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Acesso rápido
        </p>
        {perfil === "adm" && (
          <Link
            to="/admin/acesso-rapido"
            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
            aria-label="Editar o acesso rápido"
          >
            <Pencil className="size-3" aria-hidden="true" /> Editar
          </Link>
        )}
      </div>
      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar um link…"
        aria-label="Buscar um link"
        className="mt-2 h-8 w-full rounded-full border border-input bg-background px-3 text-[12.5px]"
      />
      <nav className="mt-2 space-y-0.5" aria-label="O acesso rápido">
        {busca.trim() ? (
          achados.length ? (
            achados.map((l) => <Link_ key={l.url} l={l} recuo="pl-1.5" prefixo={l.grupo} />)
          ) : (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Nenhum link com “{busca.trim()}”.
            </p>
          )
        ) : (
          <>
            {meus.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 px-1.5 py-1.5 text-[13px] font-bold">
                  <Star className="size-3.5 fill-current text-warning" aria-hidden="true" /> Meus
                  atalhos
                  <span className="ml-auto text-[10.5px] text-muted-foreground">{meus.length}</span>
                </p>
                {meus.map((l) => (
                  <Link_ key={l.url} l={l} />
                ))}
              </div>
            )}
            {grupos.map((g) => {
              const soltos = g.links.filter((l) => !l.sub);
              const subs = [...new Set(g.links.filter((l) => l.sub).map((l) => l.sub!))];
              return (
                <Grupo
                  key={g.nome}
                  id={g.nome}
                  rotulo={`${g.icone} ${g.nome}`}
                  quantos={g.links.length}
                  aberto={abertos.has(g.nome)}
                >
                  {soltos.map((l) => (
                    <Link_ key={l.url} l={l} />
                  ))}
                  {subs.map((s) => {
                    const id = `${g.nome}/${s}`;
                    const daqui = g.links.filter((l) => l.sub === s);
                    return (
                      <div key={id} className="pl-5">
                        <Grupo id={id} rotulo={s} quantos={daqui.length} aberto={abertos.has(id)}>
                          {daqui.map((l) => (
                            <Link_ key={l.url} l={l} />
                          ))}
                        </Grupo>
                      </div>
                    );
                  })}
                </Grupo>
              );
            })}
          </>
        )}
      </nav>
    </div>
  );
}

/** No celular, o acesso rápido abre num painel lateral (não cabe na faixa do menu). */
export function AcessoRapidoNoCelular(p: {
  perfil: string | null | undefined;
  pessoa: string | null | undefined;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Acesso rápido"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground"
        >
          <Link2 className="size-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[86vw] max-w-sm overflow-y-auto">
        <SheetHeader className="sr-only">
          <SheetTitle>Acesso rápido</SheetTitle>
          <SheetDescription>Os links das ferramentas do time.</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <AcessoRapido {...p} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
