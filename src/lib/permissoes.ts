/**
 * 3.67 — PERFIS DE ACESSO.
 *
 * A permissão é declarada por capacidade, não por tela. Telas mudam de nome e
 * se dividem; "pode movimentar estoque" continua sendo a mesma pergunta. Isso
 * evita que adicionar uma rota nova abra um buraco silencioso.
 *
 * O padrão é negar: capacidade que não estiver listada para o papel não existe
 * para ele.
 */

export type Capacidade =
  /** ver estoque, materiais, seriais, relatórios */
  | "estoque.ver"
  /** entrada, saída, transferência, devolução, triagem, reserva */
  | "estoque.movimentar"
  /** ajuste manual, inventário, cadastro de material e local */
  | "estoque.administrar"
  /** ver OS, quadro, fila, roteiro */
  | "os.ver"
  /** criar, editar, atribuir e mover OS */
  | "os.gerenciar"
  /** mover as próprias OS pelo fluxo de campo */
  | "os.executar"
  /** central de controle, rastreadores, regiões, parâmetros */
  | "operacao.supervisionar"
  /** auditoria e configurações do sistema */
  | "sistema.administrar";

const PERFIS: Record<string, Capacidade[]> = {
  ADMIN: [
    "estoque.ver",
    "estoque.movimentar",
    "estoque.administrar",
    "os.ver",
    "os.gerenciar",
    "os.executar",
    "operacao.supervisionar",
    "sistema.administrar",
  ],
  SUPERVISOR: [
    "estoque.ver",
    "estoque.movimentar",
    "os.ver",
    "os.gerenciar",
    "operacao.supervisionar",
  ],
  ALMOXARIFE: [
    "estoque.ver",
    "estoque.movimentar",
    "estoque.administrar",
    "os.ver",
  ],
  // o técnico enxerga o próprio trabalho e o material em posse dele
  TECNICO: ["estoque.ver", "os.ver", "os.executar"],
  VISUALIZACAO: ["estoque.ver", "os.ver"],
};

export function podeFazer(papel: string, capacidade: Capacidade) {
  return PERFIS[papel]?.includes(capacidade) ?? false;
}

export function capacidadesDe(papel: string) {
  return PERFIS[papel] ?? [];
}

/**
 * Rotas e a capacidade que cada uma exige. O prefixo mais longo vence, de modo
 * que `/os/quadro` possa exigir mais que `/os`.
 */
const ROTAS: { prefixo: string; capacidade: Capacidade }[] = [
  { prefixo: "/materiais/novo", capacidade: "estoque.administrar" },
  { prefixo: "/locais", capacidade: "estoque.ver" },
  { prefixo: "/materiais", capacidade: "estoque.ver" },
  { prefixo: "/seriais", capacidade: "estoque.ver" },
  { prefixo: "/entradas", capacidade: "estoque.movimentar" },
  { prefixo: "/movimentacoes", capacidade: "estoque.movimentar" },
  { prefixo: "/triagem", capacidade: "estoque.movimentar" },
  { prefixo: "/reservas", capacidade: "estoque.movimentar" },
  { prefixo: "/inventario", capacidade: "estoque.administrar" },
  { prefixo: "/ordens", capacidade: "estoque.ver" },
  { prefixo: "/relatorios", capacidade: "estoque.ver" },
  { prefixo: "/alertas", capacidade: "estoque.ver" },
  { prefixo: "/analise", capacidade: "estoque.ver" },
  { prefixo: "/escanear", capacidade: "estoque.ver" },
  { prefixo: "/os/nova", capacidade: "os.gerenciar" },
  { prefixo: "/os/mapa", capacidade: "os.ver" },
  { prefixo: "/os", capacidade: "os.ver" },
  { prefixo: "/fila", capacidade: "os.gerenciar" },
  { prefixo: "/roteiro", capacidade: "os.ver" },
  { prefixo: "/campo", capacidade: "os.executar" },
  { prefixo: "/central", capacidade: "operacao.supervisionar" },
  { prefixo: "/rastreador", capacidade: "operacao.supervisionar" },
  { prefixo: "/regioes", capacidade: "operacao.supervisionar" },
  { prefixo: "/auditoria", capacidade: "sistema.administrar" },
  { prefixo: "/configuracoes", capacidade: "sistema.administrar" },
  { prefixo: "/usuarios", capacidade: "sistema.administrar" },
];

/** A capacidade exigida por um caminho, ou null quando a rota é livre. */
export function capacidadeDaRota(caminho: string): Capacidade | null {
  const encontrada = ROTAS.filter(
    (r) => caminho === r.prefixo || caminho.startsWith(`${r.prefixo}/`),
  ).sort((a, b) => b.prefixo.length - a.prefixo.length)[0];
  return encontrada?.capacidade ?? null;
}

export function podeAcessar(papel: string, caminho: string) {
  const exigida = capacidadeDaRota(caminho);
  return exigida === null || podeFazer(papel, exigida);
}

/** Para onde mandar cada perfil ao entrar. */
export function telaInicial(papel: string) {
  if (papel === "TECNICO") return "/campo";
  if (papel === "SUPERVISOR") return "/central";
  return "/";
}
