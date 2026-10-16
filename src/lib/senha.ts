/**
 * Regras de senha. Espelham a política configurada no Supabase Auth
 * (Authentication → Providers → Email), que é quem de fato recusa senhas fracas.
 * Aqui servem só para orientar a pessoa ANTES de enviar.
 */
export const TAMANHO_MINIMO_SENHA = 10;

export type RegraSenha = { id: string; texto: string; atende: (senha: string) => boolean };

export const REGRAS_SENHA: RegraSenha[] = [
  {
    id: "tamanho",
    texto: `Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`,
    atende: (s) => s.length >= TAMANHO_MINIMO_SENHA,
  },
  { id: "minuscula", texto: "Uma letra minúscula", atende: (s) => /[a-z]/.test(s) },
  { id: "maiuscula", texto: "Uma letra maiúscula", atende: (s) => /[A-Z]/.test(s) },
  { id: "numero", texto: "Um número", atende: (s) => /\d/.test(s) },
  { id: "simbolo", texto: "Um símbolo (ex.: ! @ # $ %)", atende: (s) => /[^A-Za-z0-9]/.test(s) },
];

export const senhaAtendeRegras = (senha: string) => REGRAS_SENHA.every((r) => r.atende(senha));

/**
 * A troca de senha (16/10/2026): o que há de errado no pedido, ou null. As mesmas regras da primeira
 * senha; a nova diferente da atual; e a confirmação igual à nova.
 */
export function problemaDaTroca(p: {
  atual: string;
  nova: string;
  confirmacao: string;
}): string | null {
  if (!p.atual) return "Informe a sua senha atual.";
  if (!senhaAtendeRegras(p.nova)) return "A nova senha não atende às regras de segurança.";
  if (p.nova === p.atual) return "A nova senha precisa ser diferente da atual.";
  if (p.nova !== p.confirmacao) return "A confirmação não confere com a nova senha.";
  return null;
}

/** O erro do Supabase na troca de senha, numa frase para a pessoa. */
export function traduzirErroDaTroca(codigo: string | undefined): string {
  switch (codigo) {
    case "senha_atual":
    case "invalid_credentials":
      return "A senha atual não confere.";
    case "weak_password":
      return "A nova senha não atende à política de segurança. Confira os requisitos.";
    case "same_password":
      return "A nova senha precisa ser diferente da atual.";
    case "over_request_rate_limit":
    case "limite":
      return "Muitas tentativas. Espere alguns minutos e tente de novo.";
    default:
      return "Não foi possível alterar a senha. Tente novamente.";
  }
}
