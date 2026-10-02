import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, PlugZap, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dataHoraBR } from "@/lib/format";
import { verificarIntercomFn } from "@/lib/intercom.functions";

type Pessoa = { nome?: string | null; email?: string | null };
type Resumo = {
  workspace?: { nome?: string | null; fuso?: string | null };
  permissoes?: { admins?: boolean; conversas?: boolean; tickets?: boolean };
  atendentes?: number;
  ligados?: Pessoa[];
  sem_cadastro?: Pessoa[];
  sem_intercom?: Pessoa[];
};

const PERMISSOES: { chave: "conversas" | "tickets" | "admins"; nome: string }[] = [
  { chave: "conversas", nome: "Read conversations" },
  { chave: "tickets", nome: "Read tickets" },
  { chave: "admins", nome: "Read admins" },
];

/**
 * Verificação da conexão com o Intercom (só ADM). O resultado fica guardado em
 * intercom_diagnosticos, sem nenhuma conversa: só configuração e contagens.
 */
export function ConexaoIntercom() {
  const qc = useQueryClient();
  const verificar = useServerFn(verificarIntercomFn);

  const { data: ultimo } = useQuery({
    queryKey: ["intercom-diagnostico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intercom_diagnosticos")
        .select("criado_em, ok, erro, resumo")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const testar = useMutation({
    mutationFn: () => verificar(),
    onSuccess: (r) => {
      const todas = r.permissoes.admins && r.permissoes.conversas && r.permissoes.tickets;
      if (todas) toast.success(`Conexão funcionando com o workspace ${r.workspace ?? ""}.`);
      else
        toast.error("A conexão funciona, mas falta alguma permissão. Veja os detalhes no painel.");
      qc.invalidateQueries({ queryKey: ["intercom-diagnostico"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["intercom-diagnostico"] });
    },
  });

  const resumo = (ultimo?.resumo ?? null) as Resumo | null;
  const semCadastro = resumo?.sem_cadastro ?? [];
  const semIntercom = resumo?.sem_intercom ?? [];

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Conexão com o Intercom
          </p>
          {!ultimo ? (
            <p className="mt-1 text-sm text-muted-foreground">Ainda não verificada.</p>
          ) : (
            <p className="mt-1 text-sm">
              {ultimo.ok ? "Funcionando" : "Com problema"} · verificada em{" "}
              {dataHoraBR(ultimo.criado_em)}
              {resumo?.workspace?.nome && (
                <span className="text-muted-foreground"> · {resumo.workspace.nome}</span>
              )}
            </p>
          )}
          {ultimo?.erro && <p className="mt-1 text-sm text-destructive">{ultimo.erro}</p>}
        </div>
        <Button variant="outline" onClick={() => testar.mutate()} disabled={testar.isPending}>
          <PlugZap className="size-4" /> {testar.isPending ? "Verificando..." : "Verificar conexão"}
        </Button>
      </div>

      {resumo?.permissoes && (
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {PERMISSOES.map((p) => (
            <li key={p.chave} className="flex items-center gap-1.5">
              {resumo.permissoes?.[p.chave] ? (
                <CheckCircle2 className="size-4 text-primary" aria-label="permitida" />
              ) : (
                <XCircle className="size-4 text-destructive" aria-label="faltando" />
              )}
              {p.nome}
            </li>
          ))}
        </ul>
      )}

      {resumo?.permissoes?.admins && (
        <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Atendentes ligados a cadastros</p>
            <p className="font-display text-xl">
              {resumo.ligados?.length ?? 0}{" "}
              <span className="text-sm text-muted-foreground">de {resumo.atendentes ?? 0}</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">No Intercom, sem cadastro aqui</p>
            <p className="font-display text-xl">{semCadastro.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Colaboradores ativos sem conta no Intercom
            </p>
            <p className="font-display text-xl">{semIntercom.length}</p>
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        A ligação é pelo e-mail. Quem está sem ligação não poderá ter contatos sorteados para
        avaliação até o e-mail ser igual nos dois lugares. Nenhuma conversa de cliente é guardada
        nesta verificação.
      </p>
    </section>
  );
}
