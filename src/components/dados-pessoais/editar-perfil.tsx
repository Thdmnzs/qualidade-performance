import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AlterarSenha } from "@/components/dados-pessoais/alterar-senha";
import { CamposDaFicha } from "@/components/dados-pessoais/campos-da-ficha";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { problemaDaFicha, type Ficha } from "@/lib/dados-pessoais";
import { lerMeusDados, salvarMeusDados } from "@/lib/dados-pessoais-api";

/** O "Editar perfil" da pessoa: o aniversário, o endereço, o contato de emergência e a senha. */
export function EditarPerfil({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["meus-dados-pessoais"],
    queryFn: lerMeusDados,
    enabled: aberto,
  });
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (aberto && data) setFicha(data);
    if (!aberto) setFicha(null);
  }, [aberto, data]);
  const problema = ficha ? problemaDaFicha(ficha) : null;

  async function salvar() {
    if (!ficha || problema) return;
    setSalvando(true);
    try {
      await salvarMeusDados(ficha);
      toast.success("Perfil salvo.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["meus-dados-pessoais"] }),
        qc.invalidateQueries({ queryKey: ["minha-aparencia"] }),
      ]);
      aoFechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Editar perfil</DialogTitle>
          <DialogDescription>
            Só você muda o seu perfil. Cada parte diz quem pode ver.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !ficha ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <CamposDaFicha ficha={ficha} aoMudar={setFicha} daPessoa />
        )}
        {problema && <p className="text-sm font-medium text-destructive">{problema}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!ficha || !!problema || salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
        {/* Alterar a senha (16/10/2026): com o próprio botão, separado dos dados do perfil. */}
        <AlterarSenha />
      </DialogContent>
    </Dialog>
  );
}
