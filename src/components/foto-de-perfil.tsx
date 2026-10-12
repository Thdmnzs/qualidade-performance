import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ComMoldura } from "@/components/perfil/aparencia";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_DAS_FOTOS, caminhoDaFoto, iniciais, prepararFoto } from "@/lib/foto";

/** Link temporário da foto (o espaço é privado), ou null quando não há foto. */
export async function linkDaFoto(employeeId: string): Promise<string | null> {
  const armazenamento = supabase.storage.from(BUCKET_DAS_FOTOS);
  // Conferir antes evita pedir link de um arquivo que não existe.
  const { data: arquivos, error } = await armazenamento.list(employeeId, {
    search: "avatar.webp",
    limit: 1,
  });
  if (error || !arquivos?.length) return null;
  const { data, error: erroLink } = await armazenamento.createSignedUrl(
    caminhoDaFoto(employeeId),
    3600,
  );
  return erroLink ? null : data.signedUrl;
}

/**
 * Foto de perfil. Com `editavel`, mostra o lápis (enviar, remover e, com `aoTrocarMoldura`,
 * trocar a moldura); sem, só a foto (ou as iniciais), para reaproveitar em outras telas.
 * Com `moldura`, a foto ganha o anel da moldura (o da pessoa, ou o da temporada).
 */
export function FotoDePerfil({
  employeeId,
  nome,
  tamanho = "grande",
  editavel = false,
  moldura = "nenhuma",
  aoTrocarMoldura,
}: {
  employeeId: string;
  nome: string;
  tamanho?: "grande" | "pequena";
  editavel?: boolean;
  moldura?: string;
  aoTrocarMoldura?: (() => void) | undefined;
}) {
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [preparada, setPreparada] = useState<{ blob: Blob; previa: string } | null>(null);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);

  const { data: url } = useQuery({
    queryKey: ["foto", employeeId],
    queryFn: () => linkDaFoto(employeeId),
    staleTime: 50 * 60 * 1000, // o link vale 1 hora
  });

  // O endereço local da prévia ocupa memória até ser liberado.
  useEffect(
    () => () => (preparada ? URL.revokeObjectURL(preparada.previa) : undefined),
    [preparada],
  );

  const salvar = useMutation({
    mutationFn: async (blob: Blob) => {
      const { error } = await supabase.storage
        .from(BUCKET_DAS_FOTOS)
        .upload(caminhoDaFoto(employeeId), blob, {
          upsert: true,
          contentType: "image/webp",
          cacheControl: "3600",
        });
      if (error) throw new Error("Não foi possível salvar a foto. Tente novamente.");
    },
    onSuccess: () => {
      setPreparada(null);
      toast.success("Foto salva.");
      qc.invalidateQueries({ queryKey: ["foto", employeeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.storage
        .from(BUCKET_DAS_FOTOS)
        .remove([caminhoDaFoto(employeeId)]);
      if (error) throw new Error("Não foi possível remover a foto. Tente novamente.");
    },
    onSuccess: () => {
      setConfirmandoRemocao(false);
      toast.success("Foto removida.");
      qc.invalidateQueries({ queryKey: ["foto", employeeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      setPreparada(await prepararFoto(arquivo));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui preparar essa foto.");
    }
  }

  const medida = tamanho === "grande" ? "size-24 text-2xl border-2" : "size-10 text-sm border";
  const circulo = (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border-primary bg-secondary font-display font-bold ${medida}`}
    >
      {url ? (
        <img src={url} alt={`Foto de ${nome}`} className="size-full object-cover" />
      ) : (
        iniciais(nome)
      )}
    </div>
  );
  const comMoldura = (
    <ComMoldura id={moldura} espessura={tamanho === "grande" ? 6 : 3}>
      {circulo}
    </ComMoldura>
  );
  if (!editavel) return comMoldura;

  return (
    <div className="relative">
      {comMoldura}
      <input
        ref={entrada}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          void escolher(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-label="Mudar a foto ou a moldura"
          >
            <Pencil className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {/* "Enviar foto": se já houver uma, ela é trocada. */}
          <DropdownMenuItem onSelect={() => entrada.current?.click()}>Enviar foto</DropdownMenuItem>
          {url && (
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => setConfirmandoRemocao(true)}
            >
              Remover foto
            </DropdownMenuItem>
          )}
          {aoTrocarMoldura && (
            <DropdownMenuItem onSelect={aoTrocarMoldura}>Trocar moldura</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!preparada} onOpenChange={(aberto) => !aberto && setPreparada(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sua nova foto</DialogTitle>
            <DialogDescription>É assim que ela vai aparecer.</DialogDescription>
          </DialogHeader>
          {preparada && (
            <div className="flex items-center justify-center gap-5 py-2">
              <img
                src={preparada.previa}
                alt="Prévia da foto"
                className="size-32 rounded-full border-2 border-primary"
              />
              <img
                src={preparada.previa}
                alt=""
                className="size-10 rounded-full border border-border"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            A foto foi recortada no centro e reduzida. Informações escondidas no arquivo original,
            como o local onde a foto foi tirada, não são guardadas.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreparada(null)}>
              Cancelar
            </Button>
            <Button
              disabled={salvar.isPending}
              onClick={() => preparada && salvar.mutate(preparada.blob)}
            >
              {salvar.isPending ? "Salvando..." : "Salvar foto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmandoRemocao} onOpenChange={setConfirmandoRemocao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover sua foto?</AlertDialogTitle>
            <AlertDialogDescription>
              A foto é apagada de verdade, e o seu perfil volta a mostrar as iniciais. Você pode
              enviar outra quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                remover.mutate();
              }}
              disabled={remover.isPending}
            >
              {remover.isPending ? "Removendo..." : "Remover foto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
