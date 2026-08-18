/**
 * Fonte única de verdade dos domínios fechados.
 *
 * O SQLite não suporta `enum` no Prisma, então os campos são `String` no banco
 * e a validação acontece aqui e nas bordas (zod nas server actions).
 */

export type Opcao<T extends string> = {
  valor: T;
  rotulo: string;
  /** classe utilitária de cor usada pelos badges */
  tom: Tom;
};

export type Tom =
  | "neutro"
  | "positivo"
  | "informativo"
  | "atencao"
  | "critico"
  | "roxo";

function dicionario<T extends string>(opcoes: Opcao<T>[]) {
  const mapa = new Map(opcoes.map((o) => [o.valor, o]));
  return {
    opcoes,
    valores: opcoes.map((o) => o.valor),
    rotulo: (valor: string) => mapa.get(valor as T)?.rotulo ?? valor,
    tom: (valor: string): Tom => mapa.get(valor as T)?.tom ?? "neutro",
    inclui: (valor: string): valor is T => mapa.has(valor as T),
  };
}

// ---------------------------------------------------------------------------
// 1.1 — Tipos de estoque
// ---------------------------------------------------------------------------

export const TIPO_ESTOQUE = dicionario([
  { valor: "CENTRAL", rotulo: "Estoque Central", tom: "informativo" },
  { valor: "ALMOXARIFADO", rotulo: "Almoxarifado", tom: "neutro" },
  { valor: "POP", rotulo: "POP", tom: "neutro" },
  { valor: "BASE", rotulo: "Base Operacional", tom: "neutro" },
  { valor: "VEICULO", rotulo: "Veículo", tom: "neutro" },
  { valor: "TECNICO", rotulo: "Estoque Técnico", tom: "roxo" },
  { valor: "TEMPORARIO", rotulo: "Estoque Temporário", tom: "atencao" },
  { valor: "TRIAGEM", rotulo: "Triagem / Logística Reversa", tom: "atencao" },
  { valor: "MANUTENCAO", rotulo: "Manutenção", tom: "atencao" },
  { valor: "DESCARTE", rotulo: "Descarte / Sucata", tom: "critico" },
] as const as Opcao<string>[]);

/**
 * 1.12 — estoques de sistema. Material que passa por eles não conta como
 * disponível para a operação até ser aprovado na triagem.
 */
export const TIPOS_ESTOQUE_SISTEMA = ["TRIAGEM", "MANUTENCAO", "DESCARTE"];

export const TIPOS_ESTOQUE_OPERACIONAL = TIPO_ESTOQUE.valores.filter(
  (t) => !TIPOS_ESTOQUE_SISTEMA.includes(t),
);

export const TIPO_DETENTOR = dicionario([
  { valor: "ESTOQUE", rotulo: "Estoque", tom: "informativo" },
  { valor: "TECNICO", rotulo: "Técnico", tom: "roxo" },
  { valor: "EQUIPE", rotulo: "Equipe", tom: "positivo" },
] as const as Opcao<string>[]);

// ---------------------------------------------------------------------------
// 1.2 / 1.3 — Material
// ---------------------------------------------------------------------------

export const UNIDADE_MEDIDA = dicionario([
  { valor: "UN", rotulo: "Unidade", tom: "neutro" },
  { valor: "M", rotulo: "Metro", tom: "neutro" },
  { valor: "PC", rotulo: "Peça", tom: "neutro" },
  { valor: "CX", rotulo: "Caixa", tom: "neutro" },
  { valor: "KG", rotulo: "Quilograma", tom: "neutro" },
  { valor: "L", rotulo: "Litro", tom: "neutro" },
  { valor: "ROLO", rotulo: "Rolo", tom: "neutro" },
] as const as Opcao<string>[]);

/** abreviação usada ao lado dos números */
export const ABREVIACAO_UNIDADE: Record<string, string> = {
  UN: "un",
  M: "m",
  PC: "pç",
  CX: "cx",
  KG: "kg",
  L: "L",
  ROLO: "rolo",
};

export const TIPO_CONTROLE = dicionario([
  { valor: "QUANTIDADE", rotulo: "Por quantidade", tom: "neutro" },
  { valor: "SERIAL", rotulo: "Serializado", tom: "roxo" },
] as const as Opcao<string>[]);

// ---------------------------------------------------------------------------
// 1.13 — Status da unidade serializada
// ---------------------------------------------------------------------------

export const STATUS_SERIAL = dicionario([
  { valor: "DISPONIVEL", rotulo: "Disponível", tom: "positivo" },
  { valor: "RESERVADO", rotulo: "Reservado", tom: "informativo" },
  { valor: "EM_POSSE_TECNICO", rotulo: "Em posse de técnico", tom: "roxo" },
  { valor: "EM_USO", rotulo: "Em uso", tom: "informativo" },
  { valor: "INSTALADO", rotulo: "Instalado", tom: "informativo" },
  { valor: "AGUARDANDO_DEVOLUCAO", rotulo: "Aguardando devolução", tom: "atencao" },
  { valor: "DEVOLVIDO", rotulo: "Devolvido", tom: "neutro" },
  { valor: "EM_TRIAGEM", rotulo: "Em triagem", tom: "atencao" },
  { valor: "EM_MANUTENCAO", rotulo: "Em manutenção", tom: "atencao" },
  { valor: "DEFEITUOSO", rotulo: "Defeituoso", tom: "critico" },
  { valor: "PERDIDO", rotulo: "Perdido", tom: "critico" },
  { valor: "SUCATA", rotulo: "Sucata", tom: "critico" },
  { valor: "BAIXADO", rotulo: "Baixado", tom: "neutro" },
] as const as Opcao<string>[]);

/** status que ainda contam como patrimônio ativo da operação */
export const STATUS_SERIAL_ATIVOS = [
  "DISPONIVEL",
  "RESERVADO",
  "EM_POSSE_TECNICO",
  "EM_USO",
  "INSTALADO",
  "AGUARDANDO_DEVOLUCAO",
  "DEVOLVIDO",
  "EM_TRIAGEM",
  "EM_MANUTENCAO",
];

// ---------------------------------------------------------------------------
// 1.11 — Estado físico
// ---------------------------------------------------------------------------

export const ESTADO_FISICO = dicionario([
  { valor: "NOVO", rotulo: "Novo", tom: "positivo" },
  { valor: "BOM", rotulo: "Bom", tom: "positivo" },
  { valor: "USADO", rotulo: "Usado", tom: "neutro" },
  { valor: "DANIFICADO", rotulo: "Danificado", tom: "atencao" },
  { valor: "DEFEITUOSO", rotulo: "Defeituoso", tom: "critico" },
  { valor: "MANUTENCAO", rotulo: "Manutenção", tom: "atencao" },
  { valor: "SUCATA", rotulo: "Sucata", tom: "critico" },
] as const as Opcao<string>[]);

/** 1.12 — para onde a triagem manda cada estado quando aprovada automaticamente */
export const RESULTADO_SUGERIDO_POR_ESTADO: Record<string, string> = {
  NOVO: "APROVADO",
  BOM: "APROVADO",
  USADO: "APROVADO",
  DANIFICADO: "MANUTENCAO",
  DEFEITUOSO: "MANUTENCAO",
  MANUTENCAO: "MANUTENCAO",
  SUCATA: "DESCARTE",
};

// ---------------------------------------------------------------------------
// 1.4 / 1.5 — Entrada
// ---------------------------------------------------------------------------

export const TIPO_ENTRADA = dicionario([
  { valor: "COMPRA", rotulo: "Compra", tom: "positivo" },
  { valor: "TRANSFERENCIA", rotulo: "Transferência", tom: "informativo" },
  { valor: "DEVOLUCAO", rotulo: "Devolução", tom: "roxo" },
  { valor: "RETORNO_TECNICO", rotulo: "Retorno de técnico", tom: "roxo" },
  { valor: "RETIRADA_CLIENTE", rotulo: "Retirada de cliente", tom: "atencao" },
  { valor: "AJUSTE", rotulo: "Ajuste de estoque", tom: "atencao" },
  { valor: "REPOSICAO", rotulo: "Reposição", tom: "informativo" },
  { valor: "OUTRA", rotulo: "Outra origem", tom: "neutro" },
] as const as Opcao<string>[]);

export const STATUS_ENTRADA = dicionario([
  { valor: "AGUARDANDO_RECEBIMENTO", rotulo: "Aguardando recebimento", tom: "atencao" },
  { valor: "RECEBIDO", rotulo: "Recebido", tom: "positivo" },
  { valor: "CANCELADA", rotulo: "Cancelada", tom: "neutro" },
] as const as Opcao<string>[]);

// ---------------------------------------------------------------------------
// 1.7 / 1.10 — Movimentação
// ---------------------------------------------------------------------------

export const TIPO_MOVIMENTACAO = dicionario([
  { valor: "SAIDA", rotulo: "Saída", tom: "atencao" },
  { valor: "TRANSFERENCIA", rotulo: "Transferência", tom: "informativo" },
  { valor: "DEVOLUCAO", rotulo: "Devolução", tom: "roxo" },
  { valor: "AJUSTE", rotulo: "Ajuste", tom: "atencao" },
  { valor: "BAIXA", rotulo: "Baixa", tom: "critico" },
] as const as Opcao<string>[]);

export const FINALIDADE = dicionario([
  { valor: "TECNICO", rotulo: "Técnico", tom: "roxo" },
  { valor: "EQUIPE", rotulo: "Equipe", tom: "positivo" },
  { valor: "ORDEM_SERVICO", rotulo: "Ordem de Serviço", tom: "informativo" },
  { valor: "TRANSFERENCIA", rotulo: "Transferência", tom: "informativo" },
  { valor: "USO_INTERNO", rotulo: "Uso interno", tom: "neutro" },
  { valor: "INSTALACAO", rotulo: "Instalação", tom: "informativo" },
  { valor: "MANUTENCAO", rotulo: "Manutenção", tom: "atencao" },
  { valor: "BAIXA", rotulo: "Baixa", tom: "critico" },
  { valor: "PERDA", rotulo: "Perda", tom: "critico" },
  { valor: "DEFEITO", rotulo: "Defeito", tom: "critico" },
  { valor: "RETIRADA_CLIENTE", rotulo: "Retirada de cliente", tom: "atencao" },
  { valor: "AJUSTE_INVENTARIO", rotulo: "Ajuste de inventário", tom: "atencao" },
] as const as Opcao<string>[]);

// ---------------------------------------------------------------------------
// 1.23 — Razão de movimentos
// ---------------------------------------------------------------------------

export const TIPO_MOVIMENTO = dicionario([
  { valor: "ENTRADA", rotulo: "Entrada", tom: "positivo" },
  { valor: "SAIDA", rotulo: "Saída", tom: "atencao" },
  { valor: "TRANSFERENCIA", rotulo: "Transferência", tom: "informativo" },
  { valor: "DEVOLUCAO", rotulo: "Devolução", tom: "roxo" },
  { valor: "TRIAGEM", rotulo: "Triagem", tom: "roxo" },
  { valor: "AJUSTE", rotulo: "Ajuste", tom: "atencao" },
  { valor: "BAIXA", rotulo: "Baixa", tom: "critico" },
  { valor: "RESERVA", rotulo: "Reserva", tom: "informativo" },
  { valor: "LIBERACAO_RESERVA", rotulo: "Liberação de reserva", tom: "neutro" },
  { valor: "INSTALACAO", rotulo: "Instalação", tom: "informativo" },
  { valor: "RETIRADA_CLIENTE", rotulo: "Retirada de cliente", tom: "atencao" },
] as const as Opcao<string>[]);

/** movimentos que representam consumo real da operação (1.20 / 1.21 / 1.22) */
export const MOVIMENTOS_DE_CONSUMO = [
  "SAIDA",
  "INSTALACAO",
  "BAIXA",
];

// ---------------------------------------------------------------------------
// 1.14 — Reserva
// ---------------------------------------------------------------------------

export const FINALIDADE_RESERVA = dicionario([
  { valor: "ORDEM_SERVICO", rotulo: "Ordem de Serviço", tom: "informativo" },
  { valor: "TECNICO", rotulo: "Técnico", tom: "roxo" },
  { valor: "EQUIPE", rotulo: "Equipe", tom: "positivo" },
  { valor: "PROJETO", rotulo: "Projeto", tom: "neutro" },
  { valor: "MANUTENCAO", rotulo: "Manutenção", tom: "atencao" },
] as const as Opcao<string>[]);

export const STATUS_RESERVA = dicionario([
  { valor: "ATIVA", rotulo: "Ativa", tom: "informativo" },
  { valor: "CONSUMIDA", rotulo: "Consumida", tom: "positivo" },
  { valor: "CANCELADA", rotulo: "Cancelada", tom: "neutro" },
  { valor: "EXPIRADA", rotulo: "Expirada", tom: "atencao" },
] as const as Opcao<string>[]);

// ---------------------------------------------------------------------------
// 1.12 — Triagem
// ---------------------------------------------------------------------------

export const STATUS_TRIAGEM = dicionario([
  { valor: "AGUARDANDO", rotulo: "Aguardando triagem", tom: "atencao" },
  { valor: "EM_ANALISE", rotulo: "Em análise", tom: "informativo" },
  { valor: "CONCLUIDA", rotulo: "Concluída", tom: "positivo" },
] as const as Opcao<string>[]);

export const RESULTADO_TRIAGEM = dicionario([
  { valor: "APROVADO", rotulo: "Aprovado — volta ao estoque", tom: "positivo" },
  { valor: "MANUTENCAO", rotulo: "Enviar para manutenção", tom: "atencao" },
  { valor: "DESCARTE", rotulo: "Sem recuperação — sucata", tom: "critico" },
] as const as Opcao<string>[]);

// ---------------------------------------------------------------------------
// 1.26 — Inventário
// ---------------------------------------------------------------------------

export const STATUS_INVENTARIO = dicionario([
  { valor: "EM_CONTAGEM", rotulo: "Em contagem", tom: "informativo" },
  { valor: "EM_CONFERENCIA", rotulo: "Em conferência", tom: "atencao" },
  { valor: "CONCLUIDO", rotulo: "Concluído", tom: "positivo" },
  { valor: "CANCELADO", rotulo: "Cancelado", tom: "neutro" },
] as const as Opcao<string>[]);

// ---------------------------------------------------------------------------
// 1.16 — Classificação de criticidade
// ---------------------------------------------------------------------------

export const NIVEL_ESTOQUE = dicionario([
  { valor: "NORMAL", rotulo: "Normal", tom: "positivo" },
  { valor: "ATENCAO", rotulo: "Atenção", tom: "atencao" },
  { valor: "CRITICO", rotulo: "Crítico", tom: "critico" },
  { valor: "SEM_ESTOQUE", rotulo: "Sem estoque", tom: "critico" },
] as const as Opcao<string>[]);

// ---------------------------------------------------------------------------
// BLOCO 2 — Ordem de serviço
// ---------------------------------------------------------------------------

/**
 * 2.5 — O ciclo de vida da OS.
 *
 * A ordem desta lista é a ordem das colunas do quadro: mover para a direita é
 * avançar o atendimento. Só ABERTA aceita OS sem técnico; a partir de
 * ATRIBUIDA o responsável passa a ser obrigatório.
 */
export const STATUS_OS = dicionario([
  { valor: "ABERTA", rotulo: "Aberta", tom: "neutro" },
  { valor: "ATRIBUIDA", rotulo: "Atribuída", tom: "informativo" },
  { valor: "EM_DESLOCAMENTO", rotulo: "Em deslocamento", tom: "roxo" },
  { valor: "EM_ATENDIMENTO", rotulo: "Em atendimento", tom: "roxo" },
  { valor: "PENDENTE", rotulo: "Pendente", tom: "atencao" },
  { valor: "CONCLUIDA", rotulo: "Concluída", tom: "positivo" },
  { valor: "CANCELADA", rotulo: "Cancelada", tom: "neutro" },
] as const as Opcao<string>[]);

/** colunas do quadro (2.20) — as duas finais ficam fora do fluxo diário */
export const COLUNAS_QUADRO = [
  "ABERTA",
  "ATRIBUIDA",
  "EM_DESLOCAMENTO",
  "EM_ATENDIMENTO",
  "PENDENTE",
  "CONCLUIDA",
];

/** status em que a OS ainda consome capacidade da operação */
export const STATUS_OS_ABERTOS = [
  "ABERTA",
  "ATRIBUIDA",
  "EM_DESLOCAMENTO",
  "EM_ATENDIMENTO",
  "PENDENTE",
];

/** a partir daqui a OS precisa de responsável */
export const STATUS_OS_EXIGEM_TECNICO = [
  "ATRIBUIDA",
  "EM_DESLOCAMENTO",
  "EM_ATENDIMENTO",
];

export const STATUS_OS_ENCERRADOS = ["CONCLUIDA", "CANCELADA"];

export const TIPO_OS = dicionario([
  { valor: "INSTALACAO", rotulo: "Instalação", tom: "informativo" },
  { valor: "REPARO", rotulo: "Reparo", tom: "atencao" },
  { valor: "MANUTENCAO", rotulo: "Manutenção", tom: "atencao" },
  { valor: "MUDANCA_ENDERECO", rotulo: "Mudança de endereço", tom: "roxo" },
  { valor: "RETIRADA", rotulo: "Retirada de equipamento", tom: "critico" },
  { valor: "UPGRADE", rotulo: "Upgrade de plano", tom: "positivo" },
  { valor: "VISTORIA", rotulo: "Vistoria", tom: "neutro" },
  { valor: "INFRAESTRUTURA", rotulo: "Infraestrutura", tom: "neutro" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado", tom: "neutro" },
] as const as Opcao<string>[]);

export const PRIORIDADE_OS = dicionario([
  { valor: "P1", rotulo: "P1 — Emergencial", tom: "critico" },
  { valor: "P2", rotulo: "P2 — Alta", tom: "atencao" },
  { valor: "P3", rotulo: "P3 — Normal", tom: "informativo" },
  { valor: "P4", rotulo: "P4 — Baixa", tom: "neutro" },
] as const as Opcao<string>[]);

/** peso da prioridade na ordenação da fila (4.3) */
export const PESO_PRIORIDADE: Record<string, number> = {
  P1: 100,
  P2: 60,
  P3: 30,
  P4: 10,
};

export const SEVERIDADE_OS = dicionario([
  { valor: "CRITICA", rotulo: "Crítica", tom: "critico" },
  { valor: "ALTA", rotulo: "Alta", tom: "atencao" },
  { valor: "MEDIA", rotulo: "Média", tom: "informativo" },
  { valor: "BAIXA", rotulo: "Baixa", tom: "neutro" },
] as const as Opcao<string>[]);

export const ORIGEM_OS = dicionario([
  { valor: "SGP", rotulo: "SGP", tom: "informativo" },
  { valor: "LANCAMENTO_MANUAL", rotulo: "Lançamento manual", tom: "neutro" },
  { valor: "CENTRAL", rotulo: "Central de Controle", tom: "roxo" },
] as const as Opcao<string>[]);

/** 3.11 — em que pé está o técnico agora */
export const STATUS_TECNICO = dicionario([
  { valor: "DISPONIVEL", rotulo: "Disponível", tom: "positivo" },
  { valor: "EM_DESLOCAMENTO", rotulo: "Em deslocamento", tom: "informativo" },
  { valor: "EM_ATENDIMENTO", rotulo: "Em atendimento", tom: "roxo" },
  { valor: "PAUSADO", rotulo: "Pausado", tom: "atencao" },
  { valor: "AGUARDANDO_MATERIAL", rotulo: "Aguardando material", tom: "atencao" },
  { valor: "AGUARDANDO_CLIENTE", rotulo: "Aguardando cliente", tom: "atencao" },
  { valor: "RETORNANDO_BASE", rotulo: "Retornando à base", tom: "neutro" },
  { valor: "FORA_JORNADA", rotulo: "Fora da jornada", tom: "neutro" },
  { valor: "INDISPONIVEL", rotulo: "Indisponível", tom: "critico" },
] as const as Opcao<string>[]);

/** status do técnico que permitem receber uma OS nova */
export const STATUS_TECNICO_ALOCAVEIS = [
  "DISPONIVEL",
  "EM_DESLOCAMENTO",
  "RETORNANDO_BASE",
];

/** 2.28 — como está o prazo da OS */
export const SITUACAO_SLA = dicionario([
  { valor: "SEM_PRAZO", rotulo: "Sem prazo", tom: "neutro" },
  { valor: "NO_PRAZO", rotulo: "No prazo", tom: "positivo" },
  { valor: "ATENCAO", rotulo: "Perto do limite", tom: "atencao" },
  { valor: "ESTOURADO", rotulo: "Prazo estourado", tom: "critico" },
  { valor: "CONCLUIDA_NO_PRAZO", rotulo: "Concluída no prazo", tom: "positivo" },
  { valor: "CONCLUIDA_ATRASADA", rotulo: "Concluída com atraso", tom: "critico" },
] as const as Opcao<string>[]);

// ---------------------------------------------------------------------------
// BLOCO 3 — Rastreamento
// ---------------------------------------------------------------------------

/**
 * 3.1 — O QUE O APARELHO ESTÁ RASTREANDO.
 *
 * A conta da operação tem carro, celular de técnico e equipamento caro no mesmo
 * lugar. Tratar tudo como "veículo" obrigaria a inventar um carro para cada
 * OTDR — e a posição do celular, que já é a da pessoa, teria de passar por um
 * vínculo que não existe.
 *
 * NAO_CLASSIFICADO é o padrão de propósito: aparelho recém-importado entra sem
 * palpite do sistema e espera alguém dizer o que ele é.
 */
export const TIPO_RASTREADOR = dicionario([
  { valor: "VEICULO", rotulo: "Veículo", tom: "informativo" },
  { valor: "PESSOA", rotulo: "Celular de técnico", tom: "roxo" },
  { valor: "EQUIPAMENTO", rotulo: "Equipamento", tom: "positivo" },
  { valor: "NAO_CLASSIFICADO", rotulo: "Não classificado", tom: "atencao" },
] as const as Opcao<string>[]);

/** tipos que produzem posição utilizável para alocar técnico */
export const RASTREADORES_DE_PESSOA = ["PESSOA", "VEICULO"];

/** 3.8 — quão recente é a última leitura */
export const FRESCOR_POSICAO = dicionario([
  { valor: "ATUAL", rotulo: "Atual", tom: "positivo" },
  { valor: "RECENTE", rotulo: "Recente", tom: "positivo" },
  { valor: "DESATUALIZADA", rotulo: "Desatualizada", tom: "atencao" },
  { valor: "SEM_SINAL", rotulo: "Sem sinal", tom: "critico" },
] as const as Opcao<string>[]);

/** de onde a posição do técnico foi deduzida — importa para confiar nela */
export const FONTE_POSICAO = dicionario([
  { valor: "CELULAR", rotulo: "Celular do técnico", tom: "roxo" },
  { valor: "VEICULO", rotulo: "Veículo", tom: "informativo" },
  { valor: "SEM_POSICAO", rotulo: "Sem posição", tom: "critico" },
] as const as Opcao<string>[]);

// ---------------------------------------------------------------------------
// Acesso e auditoria
// ---------------------------------------------------------------------------

export const PAPEL_USUARIO = dicionario([
  { valor: "ADMIN", rotulo: "Administrador", tom: "roxo" },
  { valor: "SUPERVISOR", rotulo: "Supervisor", tom: "informativo" },
  { valor: "ALMOXARIFE", rotulo: "Almoxarife", tom: "positivo" },
  { valor: "TECNICO", rotulo: "Técnico", tom: "neutro" },
  { valor: "VISUALIZACAO", rotulo: "Visualização", tom: "neutro" },
] as const as Opcao<string>[]);

export const ACAO_AUDITORIA = dicionario([
  { valor: "CRIACAO", rotulo: "Criação", tom: "positivo" },
  { valor: "EDICAO", rotulo: "Edição", tom: "informativo" },
  { valor: "EXCLUSAO", rotulo: "Exclusão", tom: "critico" },
  { valor: "RECEBIMENTO", rotulo: "Recebimento", tom: "positivo" },
  { valor: "MOVIMENTACAO", rotulo: "Movimentação", tom: "informativo" },
  { valor: "DEVOLUCAO", rotulo: "Devolução", tom: "roxo" },
  { valor: "TRIAGEM", rotulo: "Triagem", tom: "roxo" },
  { valor: "AJUSTE", rotulo: "Ajuste", tom: "atencao" },
  { valor: "BAIXA", rotulo: "Baixa", tom: "critico" },
  { valor: "RESERVA", rotulo: "Reserva", tom: "informativo" },
  { valor: "INVENTARIO", rotulo: "Inventário", tom: "informativo" },
] as const as Opcao<string>[]);

export const CATEGORIAS_PADRAO = [
  "ONU",
  "Roteador",
  "Cabo de rede",
  "Cabo drop",
  "Conector",
  "Adaptador",
  "Splitter",
  "Fonte",
  "Cordão óptico",
  "Caixa",
  "Ferragens",
  "Equipamentos",
  "Ferramentas",
  "Materiais de consumo",
  "Outros",
];
