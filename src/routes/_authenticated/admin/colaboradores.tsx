import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useIsManager, type Perfil } from "@/hooks/useAuth";
import { fetchColaboradores } from "@/lib/queries";
import { rotuloPerfil } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/colaboradores")({
  head: () => ({
    meta: [
      { title: "Colaboradores · Qualidade & Performance" },
      { name: "description", content: "Cadastro, ativação e inativação de colaboradores do time de CX." },
    ],
  }),
  component: Colaboradores,
});

const vazio = {
  id: "",
  nome: "",
  login: "",
  email: "",
  perfil: "colaborador" as Perfil,
  /** perfil ao abrir a edição; permite saber se houve mudança */
  perfilOriginal: "colaborador" as Perfil,
  temAcesso: false,
};

function Colaboradores() {
  const { isManager, isAdmin, employee: eu } = useIsManager();
  const qc = useQueryClient();
  const [form, setForm] = useState(vazio);
  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["colaboradores"],
    queryFn: fetchColaboradores,
    enabled: isManager,
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        nome: form.nome.trim(),
        login: form.login.trim(),
        email: form.email.trim() || null,
      };
      const { error } = form.id
        ? await supabase.from("employees").update(dados).eq("id", form.id)
        : await supabase.from("employees").insert(dados);
      if (error) throw error;

      // Perfil é outro fato, gravado em user_roles pela função do banco,
      // que valida quem pode conceder o quê.
      if (form.id && form.perfil !== form.perfilOriginal) {
        const { error: erroPerfil } = await supabase.rpc("definir_perfil", {
          _employee_id: form.id,
          _perfil: form.perfil,
        });
        if (erroPerfil)
          throw new Error(`Dados salvos, mas o perfil não foi alterado: ${erroPerfil.message}`);
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Colaborador atualizado." : "Colaborador cadastrado.");
      setForm(vazio);
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
    onError: (e: Error) => {
      toast.error(
        e.message.startsWith("Dados salvos") ? e.message : `Não foi possível salvar: ${e.message}`,
      );
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
  });

  const alternarStatus = useMutation({
    mutationFn: async (c: { id: string; status: string }) => {
      const novo = c.status === "ativo" ? "inativo" : "ativo";
      const { error } = await supabase.from("employees").update({ status: novo }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado.");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
    onError: () => toast.error("Não foi possível alterar o status."),
  });

  if (!isManager) return <EmptyState titulo="Acesso restrito" texto="Área exclusiva da gestão." />;

  // Espelha as regras de definir_perfil() só para orientar a tela; o banco é quem garante.
  const editandoASiMesmo = !!form.id && form.id === eu?.id;
  const perfilEditavel =
    !!form.id && form.temAcesso && !editandoASiMesmo && (isAdmin || form.perfilOriginal !== "adm");
  const ajudaPerfil = !form.id
    ? "Novos cadastros entram como colaborador. O perfil pode ser alterado depois que o acesso for criado."
    : !form.temAcesso
      ? "Este colaborador ainda não tem acesso à plataforma."
      : editandoASiMesmo
        ? "Você não pode alterar o seu próprio perfil."
        : !perfilEditavel
          ? "Apenas administradores podem alterar o perfil ADM."
          : null;

  return (
    <div>
      <PageHeader
        titulo="Colaboradores"
        descricao="Cadastre e gerencie o time. Colaboradores com histórico nunca são excluídos — apenas inativados."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
        className="mb-8 grid gap-4 rounded-2xl border border-border bg-card p-5 md:grid-cols-5"
      >
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="login">Login</Label>
          <Input id="login" required value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="perfil">Perfil</Label>
          <select
            id="perfil"
            value={form.perfil}
            disabled={!perfilEditavel}
            aria-describedby="perfil-ajuda"
            onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
          >
            <option value="colaborador">Colaborador</option>
            <option value="gestor">Gestor</option>
            {(isAdmin || form.perfilOriginal === "adm") && <option value="adm">ADM</option>}
          </select>
          {ajudaPerfil && (
            <p id="perfil-ajuda" className="text-xs text-muted-foreground">
              {ajudaPerfil}
            </p>
          )}
        </div>
        <div className="flex gap-2 md:col-span-5">
          <Button type="submit" disabled={salvar.isPending}>
            {form.id ? "Salvar alterações" : "Cadastrar colaborador"}
          </Button>
          {form.id && (
            <Button type="button" variant="ghost" onClick={() => setForm(vazio)}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : lista.length === 0 ? (
        <EmptyState titulo="Nenhum colaborador" texto="Cadastre o primeiro colaborador acima." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{c.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.login}</td>
                  <td className="px-4 py-3">{rotuloPerfil[c.perfil]}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        c.status === "ativo" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {c.status === "ativo" ? "Ativo" : "Inativo"}
                    </span>
                    {!c.tem_acesso && (
                      <span className="ml-2 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                        Sem acesso
                      </span>
                    )}
                  </td>
                  <td className="space-x-2 px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setForm({
                          id: c.id,
                          nome: c.nome,
                          login: c.login,
                          email: c.email ?? "",
                          perfil: c.perfil,
                          perfilOriginal: c.perfil,
                          temAcesso: c.tem_acesso,
                        })
                      }
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirm(`Confirmar ${c.status === "ativo" ? "inativação" : "reativação"} de ${c.nome}?`))
                          alternarStatus.mutate(c);
                      }}
                    >
                      {c.status === "ativo" ? "Inativar" : "Reativar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
