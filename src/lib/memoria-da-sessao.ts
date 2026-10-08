/**
 * A memória da tela (o cache das consultas) acompanha QUEM está logado
 * (08/10/2026). Sempre que o usuário da sessão muda (alguém entra, sai, ou outra
 * pessoa entra no mesmo navegador), a memória inteira é apagada: nada de uma
 * sessão aparece na outra (por exemplo, o "Cadastro não vinculado" guardado
 * de antes do login, ou os dados da pessoa anterior). Puro, para ser testado.
 *
 * `anterior` é undefined só antes do primeiro aviso da sessão (a abertura do site).
 */
export function deveApagarAMemoria(
  anterior: string | null | undefined,
  atual: string | null,
): boolean {
  return anterior !== undefined && anterior !== atual;
}
