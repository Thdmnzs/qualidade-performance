import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import {
  ExcluirColaboradorDialog,
  type ColaboradorParaExcluir,
} from "@/components/excluir-colaborador-dialog";
import { ConexaoIntercom } from "@/components/conexao-intercom";
import { LinkDeAcessoDialog, type LinkDeAcesso } from "@/components/link-de-acesso-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { usePermissoes, type Perfil } from "@/hooks/useAuth";
import { fetchColaboradores } from "@/lib/queries";
import { lerSituacaoDosDados } from "@/lib/dados-pessoais-api";
import { textoDoQueFalta } from "@/lib/dados-pessoais";
import { FichaDoAdm } from "@/components/dados-pessoais/ficha-do-adm";
import { alterarStatusFn, criarAcessoFn, gerarLinkDeSenhaFn } from "@/lib/acessos.functions";
import { verificacaoDoTimeFn } from "@/lib/verificacao.functions";
import { VerificacaoDaPessoa } from "@/components/verificacao/desligar-verificacao";
import { LOGIN_VALIDO, normalizarEmail, normalizarLogin, rotuloPerfil } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/colaboradores")({
  head: () => ({
    meta: [
      { title: "Colaboradores · CX Hub" },
      {
        name: "description",
        content: "Cadastro, ativação e inativação de colaboradores do time de CX.",
      },
    ],
  }),
  component: Colaboradores,
});

const vazio = {
  id: "",
  nome: "",
  login: "",
  email: "",
  turno: "" as "" | "Manhã" | "Tarde" | "Noite",
  perfil: "colaborador" as Perfil,
  /** perfil ao abrir a edição; permite saber se houve mudança */
  perfilOriginal: "colaborador" as Perfil,
  temAcesso: false,
};

function Colaboradores() {
  const { isAdmin, employee: eu } = usePermissoes();
  const qc = useQueryClient();
  const [form, setForm] = useState(vazio);
  const [linkAberto, setLinkAberto] = useState<LinkDeAcesso | null>(null);
  const [excluindo, setExcluindo] = useState<ColaboradorParaExcluir | null>(null);
  const criarAcesso = useServerFn(criarAcessoFn);
  const gerarLinkDeSenha = useServerFn(gerarLinkDeSenhaFn);
  const alterarStatus = useServerFn(alterarStatusFn);
  const atualizarLista = () => qc.invalidateQueries({ queryKey: ["colaboradores"] });
  // A verificação em duas etapas de cada pessoa (21/10/2026): { id do cadastro: quando foi ativada }.
  const verificacaoDoTime = useServerFn(verificacaoDoTimeFn);
  const { data: verificacao = {} } = useQuery({
    queryKey: ["verificacao-do-time"],
    queryFn: () => verificacaoDoTime(),
  });
  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["colaboradores"],
    queryFn: fetchColaboradores,
    enabled: isAdmin,
  });
  // Os dados pessoais: o que falta em cada ficha (sem os dados), e a ficha aberta.
  const { data: situacaoDosDados = new Map<string, string[]>() } = useQuery({
    queryKey: ["situacao-dos-dados"],
    queryFn: lerSituacaoDosDados,
    enabled: isAdmin,
  });
  const [fichaAberta, setFichaAberta] = useState<{ id: string; nome: string } | null>(null);
  // O turno fica à parte da listagem (a função da listagem é usada por outras telas).
  const { data: turnos = {} } = useQuery({
    queryKey: ["colaboradores-turnos"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, turno");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((e) => [e.id, e.turno ?? ""])) as Record<
        string,
        string
      >;
    },
  });
  const ativos = lista.filter((c) => c.status === "ativo");
  const inativos = lista.filter((c) => c.status === "inativo");

  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        nome: form.nome.trim(),
        login: normalizarLogin(form.login),
        email: normalizarEmail(form.email),
        turno: form.turno || null,
      };
      if (!LOGIN_VALIDO.test(dados.login)) {
        throw new Error(
          "Login deve ter de 3 a 50 caracteres: letras minúsculas, números, ponto, hífen ou _.",
        );
      }

      if (form.id) {
        const { error } = await supabase.from("employees").update(dados).eq("id", form.id);
        if (error) throw new Error(mensagemDoBanco(error));

        // Perfil é outro fato, gravado em user_roles pela função do banco,
        // que valida quem pode conceder o quê.
        if (form.perfil !== form.perfilOriginal) {
          const { error: erroPerfil } = await supabase.rpc("definir_perfil", {
            _employee_id: form.id,
            _perfil: form.perfil,
          });
          if (erroPerfil)
            throw new Error(`Dados salvos, mas o perfil não foi alterado: ${erroPerfil.message}`);
        }
        return { mensagem: "Colaborador atualizado." };
      }

      // Cadastro novo: primeiro o registro, depois o acesso. Se o acesso falhar,
      // o cadastro permanece e a linha mostra "Criar acesso" para tentar de novo.
      const { data: criado, error } = await supabase
        .from("employees")
        .insert(dados)
        .select("id")
        .single();
      if (error) throw new Error(mensagemDoBanco(error));

      try {
        const { link } = await criarAcesso({
          data: { employeeId: criado.id, perfil: form.perfil },
        });
        setLinkAberto({ nome: dados.nome, link, tipo: "convite" });
        return { mensagem: "Colaborador cadastrado e convite gerado." };
      } catch (e) {
        throw new Error(
          `Colaborador cadastrado, mas o acesso não foi criado: ${(e as Error).message} ` +
            'Use "Criar acesso" na lista para tentar de novo.',
        );
      }
    },
    onSuccess: ({ mensagem }) => {
      toast.success(mensagem);
      setForm(vazio);
      qc.invalidateQueries({ queryKey: ["colaboradores-turnos"] });
    },
    onError: (e: Error) => {
      toast.error(
        e.message.startsWith("Dados salvos") || e.message.startsWith("Colaborador cadastrado")
          ? e.message
          : `Não foi possível salvar: ${e.message}`,
      );
      if (e.message.startsWith("Colaborador cadastrado")) setForm(vazio);
    },
    onSettled: atualizarLista,
  });

  const criarAcessoDaLinha = useMutation({
    mutationFn: async (c: { id: string; nome: string }) => {
      const { link } = await criarAcesso({ data: { employeeId: c.id, perfil: "colaborador" } });
      setLinkAberto({ nome: c.nome, link, tipo: "convite" });
    },
    onSuccess: () => toast.success("Convite gerado."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: atualizarLista,
  });

  const gerarLink = useMutation({
    mutationFn: async (c: { id: string; nome: string }) => {
      const { link } = await gerarLinkDeSenha({ data: { employeeId: c.id } });
      setLinkAberto({ nome: c.nome, link, tipo: "senha" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternarStatus = useMutation({
    mutationFn: (c: { id: string; status: string }) =>
      alterarStatus({ data: { employeeId: c.id, ativo: c.status !== "ativo" } }),
    onSuccess: () => toast.success("Status atualizado."),
    onError: (e: Error) => toast.error(e.message),
    onSettled: atualizarLista,
  });

  const ocupado = criarAcessoDaLinha.isPending || gerarLink.isPending || alternarStatus.isPending;

  if (!isAdmin)
    return <EmptyState titulo="Acesso restrito" texto="Área exclusiva dos administradores." />;

  // Espelha as regras de definir_perfil() só para orientar a tela; o banco é quem garante.
  const editandoASiMesmo = !!form.id && form.id === eu?.id;
  // (Só o ADM chega aqui, então não há mais regra de hierarquia entre perfis na tela.)
  const perfilEditavel = !form.id ? true : form.temAcesso && !editandoASiMesmo;
  const ajudaPerfil = !form.id
    ? "O acesso é criado junto com o cadastro, com este perfil. Avaliadores também são colaboradores."
    : !form.temAcesso
      ? "Este colaborador ainda não tem acesso à plataforma."
      : editandoASiMesmo
        ? "Você não pode alterar o seu próprio perfil."
        : null;

  // Mesma tabela para os dois blocos; o botão Excluir só aparece para inativos.
  const tabelaDe = (itens: typeof lista) => (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">Login</th>
            <th className="px-4 py-3">Perfil</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Dados pessoais</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr key={c.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{c.nome}</td>
              <td className="px-4 py-3 text-muted-foreground">{c.login}</td>
              <td className="px-4 py-3">{rotuloPerfil[c.perfil]}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    c.status === "ativo"
                      ? "bg-primary/15 text-primary"
                      : "bg-destructive/15 text-destructive"
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
              <td className="px-4 py-3">
                {textoDoQueFalta(situacaoDosDados.get(c.id) ?? []) ? (
                  <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-bold">
                    {textoDoQueFalta(situacaoDosDados.get(c.id) ?? [])}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">✓ completos</span>
                )}
              </td>
              <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setFichaAberta({ id: c.id, nome: c.nome })}
                >
                  🔒 Dados pessoais
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      id: c.id,
                      nome: c.nome,
                      login: c.login,
                      email: c.email ?? "",
                      turno: (turnos[c.id] ?? "") as typeof vazio.turno,
                      perfil: c.perfil,
                      perfilOriginal: c.perfil,
                      temAcesso: c.tem_acesso,
                    })
                  }
                >
                  Editar
                </Button>
                {c.status === "ativo" && !c.tem_acesso && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={ocupado}
                    onClick={() => criarAcessoDaLinha.mutate(c)}
                  >
                    Criar acesso
                  </Button>
                )}
                {c.status === "ativo" && c.tem_acesso && c.id !== eu?.id && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={ocupado}
                    onClick={() => gerarLink.mutate(c)}
                  >
                    Link de senha
                  </Button>
                )}
                {c.status === "ativo" && c.tem_acesso && c.id !== eu?.id && (
                  <VerificacaoDaPessoa
                    employeeId={c.id}
                    nome={c.nome}
                    ativaEm={verificacao[c.id]}
                  />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado || c.id === eu?.id}
                  title={
                    c.id === eu?.id ? "Você não pode inativar o seu próprio cadastro." : undefined
                  }
                  onClick={() => {
                    const acao = c.status === "ativo" ? "inativação" : "reativação";
                    const efeito =
                      c.status === "ativo"
                        ? " O login será bloqueado imediatamente; o histórico é mantido."
                        : "";
                    if (confirm(`Confirmar ${acao} de ${c.nome}?${efeito}`))
                      alternarStatus.mutate(c);
                  }}
                >
                  {c.status === "ativo" ? "Inativar" : "Reativar"}
                </Button>
                {c.status === "inativo" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={ocupado}
                    onClick={() => setExcluindo({ id: c.id, nome: c.nome })}
                  >
                    Excluir
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <PageHeader
        titulo="Colaboradores"
        descricao="Cadastre e gerencie o time. Inativar bloqueia o acesso; excluir (só inativos) apaga a pessoa e tudo o que é dela."
      />

      {/* Só ADM chega a esta tela; a verificação também confere isso no servidor. */}
      <ConexaoIntercom />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
        className="mb-8 grid gap-4 rounded-2xl border border-border bg-card p-5 md:grid-cols-5"
      >
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="nome">Nome</Label>
          <Input
            id="nome"
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="login">Login</Label>
          <Input
            id="login"
            required
            value={form.login}
            placeholder="nome.sobrenome"
            onChange={(e) => setForm({ ...form, login: e.target.value })}
            onBlur={() => setForm((f) => ({ ...f, login: normalizarLogin(f.login) }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            required
            disabled={form.temAcesso}
            aria-describedby={form.temAcesso ? "email-ajuda" : undefined}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          {form.temAcesso && (
            <p id="email-ajuda" className="text-xs text-muted-foreground">
              É o e-mail de login; não pode ser alterado depois que o acesso existe.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="turno">Turno</Label>
          <select
            id="turno"
            value={form.turno}
            onChange={(e) => setForm({ ...form, turno: e.target.value as typeof vazio.turno })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Sem turno</option>
            <option>Manhã</option>
            <option>Tarde</option>
            <option>Noite</option>
          </select>
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
            <option value="avaliador">Avaliador</option>
            <option value="adm">ADM</option>
          </select>
          {ajudaPerfil && (
            <p id="perfil-ajuda" className="text-xs text-muted-foreground">
              {ajudaPerfil}
            </p>
          )}
        </div>
        <div className="flex gap-2 md:col-span-5">
          <Button type="submit" disabled={salvar.isPending}>
            {salvar.isPending
              ? "Salvando..."
              : form.id
                ? "Salvar alterações"
                : "Cadastrar e gerar convite"}
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
        <div className="space-y-4">
          <BlocoDeColaboradores
            titulo="Colaboradores ativos"
            quantidade={ativos.length}
            abertoPorPadrao
          >
            {ativos.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-muted-foreground">Nenhum colaborador ativo.</p>
            ) : (
              tabelaDe(ativos)
            )}
          </BlocoDeColaboradores>
          <BlocoDeColaboradores titulo="Colaboradores inativos" quantidade={inativos.length}>
            {inativos.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-muted-foreground">Nenhum colaborador inativo.</p>
            ) : (
              <>
                <p className="px-5 pb-3 text-xs text-muted-foreground">
                  Inativos não acessam a plataforma. Excluir apaga a pessoa e tudo o que é dela, sem
                  volta.
                </p>
                {tabelaDe(inativos)}
              </>
            )}
          </BlocoDeColaboradores>
        </div>
      )}

      <LinkDeAcessoDialog dados={linkAberto} onFechar={() => setLinkAberto(null)} />
      <ExcluirColaboradorDialog colaborador={excluindo} onFechar={() => setExcluindo(null)} />
      <FichaDoAdm pessoa={fichaAberta} aoFechar={() => setFichaAberta(null)} />
    </div>
  );
}

/** Traduz violações de regras do banco em mensagens para a tela. */
function mensagemDoBanco(error: { code?: string; message: string }): string {
  if (error.message.includes("employees_email_unico"))
    return "Já existe um colaborador com este e-mail.";
  if (error.message.includes("employees_login_key"))
    return "Já existe um colaborador com este login.";
  if (error.message.includes("employees_email_formato")) return "E-mail inválido.";
  if (error.message.includes("employees_login_formato")) return "Login inválido.";
  return error.message;
}

/** Bloco recolhível com título e contagem. */
function BlocoDeColaboradores({
  titulo,
  quantidade,
  abertoPorPadrao = false,
  children,
}: {
  titulo: string;
  quantidade: number;
  abertoPorPadrao?: boolean;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(abertoPorPadrao);
  return (
    <Collapsible
      open={aberto}
      onOpenChange={setAberto}
      className="rounded-2xl border border-border bg-card"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="font-display font-semibold">
          {titulo}{" "}
          <span className="ml-1 text-sm font-normal text-muted-foreground">({quantidade})</span>
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
