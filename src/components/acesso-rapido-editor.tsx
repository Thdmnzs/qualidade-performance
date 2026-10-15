import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Atalho, GrupoDeAtalhos } from "@/lib/acesso-rapido";
import {
  excluirAtalho,
  excluirGrupo,
  lerAcessoRapido,
  moverAtalho,
  moverGrupo,
  salvarAtalho,
  salvarGrupo,
} from "@/lib/acesso-rapido-api";

/** O endereço vale? (a mesma regra do banco: https, e sem espaços) */
export const problemaDoEndereco = (url: string) =>
  !url.trim()
    ? "Informe o endereço."
    : !/^https:\/\/\S+$/.test(url.trim())
      ? "O endereço precisa começar com https:// (e não ter espaços)."
      : null;

type FormGrupo = { id: string | null; nome: string; icone: string };
type FormLink = {
  id: string | null;
  grupoId: string;
  nome: string;
  url: string;
  sub: string;
  restrito: boolean;
};
type Exclusao =
  | { tipo: "grupo"; id: string; nome: string; links: number }
  | { tipo: "link"; id: string; nome: string };

/**
 * A edição do acesso rápido (14/10/2026), só do ADM: os grupos (o nome, o emoji, a ordem) e os links
 * (o nome, o endereço, o subgrupo, se é restrito, a ordem). Cada mudança vai para o banco, que confere
 * tudo de novo e registra no Histórico.
 */
export function EditorDoAcessoRapido() {
  const qc = useQueryClient();
  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ["acesso-rapido"],
    queryFn: lerAcessoRapido,
  });
  const [formGrupo, setFormGrupo] = useState<FormGrupo | null>(null);
  const [formLink, setFormLink] = useState<FormLink | null>(null);
  const [exclusao, setExclusao] = useState<Exclusao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const subsExistentes = [
    ...new Set(grupos.flatMap((g) => g.links.map((l) => l.sub).filter((s): s is string => !!s))),
  ];

  async function fazer(acao: () => Promise<unknown>, ok?: string) {
    setOcupado(true);
    try {
      await acao();
      if (ok) toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["acesso-rapido"] });
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  }
  const problemaDoLink = formLink
    ? !formLink.nome.trim()
      ? "Dê um nome ao link."
      : formLink.nome.trim().length > 60
        ? "O nome pode ter até 60 caracteres."
        : problemaDoEndereco(formLink.url)
    : null;
  const problemaDoGrupo = formGrupo
    ? !formGrupo.nome.trim()
      ? "Dê um nome ao grupo."
      : formGrupo.nome.trim().length > 40
        ? "O nome pode ter até 40 caracteres."
        : null
    : null;

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Carregando o acesso rápido...</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Acesso rápido</h2>
          <p className="text-sm text-muted-foreground">
            Os links das ferramentas do time, na barra lateral. Cada mudança aparece para todos na
            hora, e vai para o Histórico. Os links restritos aparecem só para o ADM.
          </p>
        </div>
        <Button onClick={() => setFormGrupo({ id: null, nome: "", icone: "" })}>
          <Plus className="size-4" /> Novo grupo
        </Button>
      </div>

      {grupos.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum grupo ainda.
        </p>
      )}

      {grupos.map((g, gi) => (
        <section
          key={g.id}
          className="rounded-2xl border border-border bg-card"
          aria-label={`O grupo ${g.nome}`}
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <p className="min-w-0 flex-1 truncate font-bold">
              {g.icone} {g.nome}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                · {g.links.length} {g.links.length === 1 ? "link" : "links"}
              </span>
            </p>
            <Botoes
              rotulo={`o grupo ${g.nome}`}
              primeiro={gi === 0}
              ultimo={gi === grupos.length - 1}
              ocupado={ocupado}
              aoSubir={() => fazer(() => moverGrupo(g.id!, -1))}
              aoDescer={() => fazer(() => moverGrupo(g.id!, 1))}
              aoEditar={() => setFormGrupo({ id: g.id!, nome: g.nome, icone: g.icone ?? "" })}
              aoExcluir={() =>
                setExclusao({ tipo: "grupo", id: g.id!, nome: g.nome, links: g.links.length })
              }
            />
          </div>
          <ul>
            {g.links.map((l, li) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-sm first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {l.nome}
                    {l.sub && (
                      <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-bold">
                        {l.sub}
                      </span>
                    )}
                    {l.restrito && (
                      <span className="ml-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10.5px] font-bold text-destructive">
                        restrito
                      </span>
                    )}
                  </p>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                  >
                    <span className="truncate">{l.url}</span>{" "}
                    <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                  </a>
                </div>
                <Botoes
                  rotulo={`o link ${l.nome}`}
                  primeiro={li === 0}
                  ultimo={li === g.links.length - 1}
                  ocupado={ocupado}
                  aoSubir={() => fazer(() => moverAtalho(l.id!, -1))}
                  aoDescer={() => fazer(() => moverAtalho(l.id!, 1))}
                  aoEditar={() =>
                    setFormLink({
                      id: l.id!,
                      grupoId: g.id!,
                      nome: l.nome,
                      url: l.url,
                      sub: l.sub ?? "",
                      restrito: !!l.restrito,
                    })
                  }
                  aoExcluir={() => setExclusao({ tipo: "link", id: l.id!, nome: l.nome })}
                />
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setFormLink({
                  id: null,
                  grupoId: g.id!,
                  nome: "",
                  url: "",
                  sub: "",
                  restrito: false,
                })
              }
            >
              <Plus className="size-4" /> Novo link
            </Button>
          </div>
        </section>
      ))}

      {/* O grupo: criar ou editar */}
      <Dialog open={!!formGrupo} onOpenChange={(a) => !a && setFormGrupo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formGrupo?.id ? "Editar o grupo" : "Novo grupo"}</DialogTitle>
            <DialogDescription>
              O nome aparece na barra lateral, com o emoji na frente.
            </DialogDescription>
          </DialogHeader>
          {formGrupo && (
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              <label className="text-sm font-bold">
                Emoji
                <input
                  value={formGrupo.icone}
                  onChange={(e) => setFormGrupo({ ...formGrupo, icone: e.target.value })}
                  maxLength={8}
                  placeholder="🔗"
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-center text-lg"
                />
              </label>
              <label className="text-sm font-bold">
                Nome do grupo
                <input
                  value={formGrupo.nome}
                  onChange={(e) => setFormGrupo({ ...formGrupo, nome: e.target.value })}
                  maxLength={40}
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal"
                />
              </label>
              {problemaDoGrupo && (
                <p className="col-span-2 text-xs text-destructive">{problemaDoGrupo}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormGrupo(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!!problemaDoGrupo || ocupado}
              onClick={async () => {
                const f = formGrupo!;
                if (
                  await fazer(
                    () => salvarGrupo(f.id, f.nome.trim(), f.icone.trim()),
                    f.id ? "Grupo salvo." : "Grupo criado.",
                  )
                )
                  setFormGrupo(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* O link: criar ou editar */}
      <Dialog open={!!formLink} onOpenChange={(a) => !a && setFormLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formLink?.id ? "Editar o link" : "Novo link"}</DialogTitle>
            <DialogDescription>
              O link abre numa aba nova. Só endereços com https://.
            </DialogDescription>
          </DialogHeader>
          {formLink && (
            <div className="space-y-3">
              <label className="block text-sm font-bold">
                Nome
                <input
                  value={formLink.nome}
                  onChange={(e) => setFormLink({ ...formLink, nome: e.target.value })}
                  maxLength={60}
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Endereço
                <input
                  value={formLink.url}
                  onChange={(e) => setFormLink({ ...formLink, url: e.target.value })}
                  placeholder="https://"
                  inputMode="url"
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-bold">
                  Grupo
                  <select
                    value={formLink.grupoId}
                    onChange={(e) => setFormLink({ ...formLink, grupoId: e.target.value })}
                    className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal"
                  >
                    {grupos.map((g: GrupoDeAtalhos) => (
                      <option key={g.id} value={g.id}>
                        {g.icone} {g.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-bold">
                  Subgrupo (opcional)
                  <input
                    value={formLink.sub}
                    onChange={(e) => setFormLink({ ...formLink, sub: e.target.value })}
                    list="subgrupos-existentes"
                    maxLength={40}
                    placeholder="Ex.: Slides"
                    className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal"
                  />
                  <datalist id="subgrupos-existentes">
                    {subsExistentes.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </label>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formLink.restrito}
                  onChange={(e) => setFormLink({ ...formLink, restrito: e.target.checked })}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <b>Restrito</b>
                  <span className="block text-xs text-muted-foreground">
                    Aparece só para o ADM (por exemplo, uma planilha com dados sensíveis).
                  </span>
                </span>
              </label>
              {problemaDoLink && (formLink.nome || formLink.url) && (
                <p className="text-xs text-destructive">{problemaDoLink}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormLink(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!!problemaDoLink || ocupado}
              onClick={async () => {
                const f = formLink!;
                if (
                  await fazer(
                    () =>
                      salvarAtalho({
                        ...f,
                        nome: f.nome.trim(),
                        url: f.url.trim(),
                        sub: f.sub.trim(),
                      }),
                    f.id ? "Link salvo." : "Link criado.",
                  )
                )
                  setFormLink(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* A exclusão, com a confirmação */}
      <AlertDialog open={!!exclusao} onOpenChange={(a) => !a && setExclusao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {exclusao?.tipo === "grupo"
                ? `Excluir o grupo “${exclusao.nome}”?`
                : `Excluir o link “${exclusao?.nome}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {exclusao?.tipo === "grupo" && exclusao.links > 0
                ? `Os ${exclusao.links} links dele também saem. Isso não pode ser desfeito.`
                : "Isso não pode ser desfeito."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const e = exclusao!;
                void fazer(
                  () => (e.tipo === "grupo" ? excluirGrupo(e.id) : excluirAtalho(e.id)),
                  e.tipo === "grupo" ? "Grupo excluído." : "Link excluído.",
                );
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Botoes(p: {
  rotulo: string;
  primeiro: boolean;
  ultimo: boolean;
  ocupado: boolean;
  aoSubir: () => void;
  aoDescer: () => void;
  aoEditar: () => void;
  aoExcluir: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={`Subir ${p.rotulo}`}
        disabled={p.primeiro || p.ocupado}
        onClick={p.aoSubir}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={`Descer ${p.rotulo}`}
        disabled={p.ultimo || p.ocupado}
        onClick={p.aoDescer}
      >
        <ArrowDown className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={`Editar ${p.rotulo}`}
        disabled={p.ocupado}
        onClick={p.aoEditar}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-destructive"
        aria-label={`Excluir ${p.rotulo}`}
        disabled={p.ocupado}
        onClick={p.aoExcluir}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export type { Atalho };
