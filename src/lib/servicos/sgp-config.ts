import { ErroDeNegocio } from "./nucleo";

/**
 * Credenciais do SGP, num módulo só.
 *
 * Estava dentro de `sgp.ts`, que é quem lê. Agora quem escreve também precisa
 * delas, e `sgp.ts` importa a distribuição — puxar de volta fecharia um ciclo
 * de imports. Um módulo sem dependências resolve, e de quebra deixa claro que
 * o `.env` é lido em um lugar só.
 */
export function configuracaoSgp() {
  const base = (process.env.SGP_BASE_URL ?? process.env.SGP_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const app = process.env.SGP_APP ?? "";
  const token = process.env.SGP_TOKEN ?? "";

  if (!base) throw new ErroDeNegocio("SGP_BASE_URL não configurada no .env.");
  if (!app || !token) {
    throw new ErroDeNegocio("SGP_APP e SGP_TOKEN precisam estar no .env.");
  }
  return { base, app, token };
}
