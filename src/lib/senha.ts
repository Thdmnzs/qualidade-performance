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
