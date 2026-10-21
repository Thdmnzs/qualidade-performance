import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Label } from "@/components/ui/label";
import { dataBR } from "@/lib/format";
import { desligarVerificacaoFn } from "@/lib/verificacao.functions";

/**
 * A verificação em duas etapas de uma pessoa, na tela de Colaboradores (21/10/2026): a situação, e o desligamento
 * pelo ADM (para quem perdeu o celular E os códigos de recuperação), confirmado com a senha do próprio ADM.
 */
export function VerificacaoDaPessoa({
  employeeId,
  nome,
  ativaEm,
}: {
  employeeId: string;
  nome: string;
  ativaEm: string | null | undefined;
}) {
  const qc = useQueryClient();
  const desligar = useServerFn(desligarVerificacaoFn);
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const primeiro = nome.split(" ")[0];
  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await desligar({ data: { employeeId, senha } });
      toast.success(
        `A verificação de ${primeiro} foi desligada. Na próxima entrada, ${primeiro} cadastra o celular novo.`,
      );
      setAberto(false);
      await qc.invalidateQueries({ queryKey: ["verificacao-do-time"] });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
      setSenha("");
    }
  }
  return (
    <>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ativaEm ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}
      >
        {ativaEm
          ? `🔐 verificação ativa desde ${dataBR(ativaEm)}`
          : "🔓 verificação ainda não cadastrada"}
      </span>
      {ativaEm && (
        <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
          Desligar a verificação
        </Button>
      )}
      <Dialog open={aberto} onOpenChange={(a) => (setAberto(a), setErro(null), setSenha(""))}>
        <DialogContent>
          <form onSubmit={confirmar}>
            <DialogHeader>
              <DialogTitle>Desligar a verificação de {primeiro}?</DialogTitle>
              <DialogDescription>
                Use só quando {primeiro} perdeu o celular <b>e</b> os códigos de recuperação. Os
                códigos antigos perdem a validade, as sessões abertas são encerradas, e {primeiro}{" "}
                cadastra de novo na próxima entrada. Fica registrado no Histórico.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="senha-do-adm">Para confirmar, digite a sua senha</Label>
              <Input
                id="senha-do-adm"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            {erro && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {erro}
              </p>
            )}
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={!senha || enviando}>
                {enviando ? "Desligando..." : "Desligar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
