/**
 * Ligação entre os atendentes do Intercom e os cadastros da plataforma.
 * A chave é o e-mail, comparado sem diferença de maiúsculas e sem espaços.
 */
export type Atendente = { id?: string | number; name?: string | null; email?: string | null };
export type Cadastro = { id: string; nome: string; email: string | null };

export const normalizarEmailIntercom = (e?: string | null) => (e ?? "").trim().toLowerCase();

export type Cruzamento = {
  ligados: { atendente: Atendente; cadastro: Cadastro }[];
  /** No Intercom, sem cadastro aqui: não recebem avaliações sorteadas. */
  semCadastro: Atendente[];
  /** Cadastrados aqui, sem conta (ou com outro e-mail) no Intercom. */
  semIntercom: Cadastro[];
};

export function cruzarAtendentes(atendentes: Atendente[], cadastros: Cadastro[]): Cruzamento {
  const porEmail = new Map(
    cadastros
      .filter((c) => normalizarEmailIntercom(c.email))
      .map((c) => [normalizarEmailIntercom(c.email), c]),
  );
  const comEmail = atendentes.filter((a) => normalizarEmailIntercom(a.email));
  const emailsIntercom = new Set(comEmail.map((a) => normalizarEmailIntercom(a.email)));

  const ligados: Cruzamento["ligados"] = [];
  const semCadastro: Atendente[] = [];
  for (const a of comEmail) {
    const c = porEmail.get(normalizarEmailIntercom(a.email));
    if (c) ligados.push({ atendente: a, cadastro: c });
    else semCadastro.push(a);
  }
  const semIntercom = cadastros.filter(
    (c) => !emailsIntercom.has(normalizarEmailIntercom(c.email)),
  );
  return { ligados, semCadastro, semIntercom };
}
