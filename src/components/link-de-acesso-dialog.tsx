import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type LinkDeAcesso = {
  nome: string;
  link: string;
  tipo: "convite" | "senha";
};

/**
 * Mostra o link UMA vez. Ele não é salvo em lugar nenhum: se a janela for
 * fechada sem copiar, basta gerar outro (o anterior continua válido até expirar).
 */
export function LinkDeAcessoDialog({
  dados,
  onFechar,
}: {
  dados: LinkDeAcesso | null;
  onFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  function fechar() {
    setCopiado(false);
    onFechar();
  }

  async function copiar() {
    if (!dados) return;
    try {
      await navigator.clipboard.writeText(dados.link);
      setCopiado(true);
      toast.success("Link copiado.");
    } catch {
      // Alguns navegadores bloqueiam a área de transferência; o campo permite copiar à mão.
      toast.error("Não foi possível copiar automaticamente. Selecione o link e copie.");
    }
  }

  const titulo =
    dados?.tipo === "convite"
      ? `Convite de ${dados.nome}`
      : `Link de senha de ${dados?.nome ?? ""}`;

  return (
    <Dialog
      open={!!dados}
      onOpenChange={(aberto) => {
        if (!aberto) fechar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Envie este link pelo Slack, numa conversa direta com a pessoa. Ao abrir, ela cria a
            própria senha. O link é pessoal, funciona uma única vez e expira.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            readOnly
            value={dados?.link ?? ""}
            aria-label="Link de acesso"
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button type="button" onClick={copiar} className="shrink-0">
            {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Não publique em canais abertos: quem tiver o link consegue definir a senha dessa conta.
        </p>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={fechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
