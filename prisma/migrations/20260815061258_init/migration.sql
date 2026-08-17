-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Tecnico" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "telefone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISPONIVEL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipeId" TEXT,
    "usuarioId" TEXT,
    CONSTRAINT "Tecnico_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tecnico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Estoque" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "endereco" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsavelId" TEXT,
    CONSTRAINT "Estoque_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Detentor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estoqueId" TEXT,
    "tecnicoId" TEXT,
    "equipeId" TEXT,
    CONSTRAINT "Detentor_estoqueId_fkey" FOREIGN KEY ("estoqueId") REFERENCES "Estoque" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Detentor_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Detentor_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#64748b',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "contato" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigoInterno" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fabricante" TEXT,
    "modelo" TEXT,
    "unidadeMedida" TEXT NOT NULL DEFAULT 'UN',
    "controle" TEXT NOT NULL DEFAULT 'QUANTIDADE',
    "quantidadeMinima" REAL NOT NULL DEFAULT 0,
    "quantidadeIdeal" REAL NOT NULL DEFAULT 0,
    "valorMedio" REAL NOT NULL DEFAULT 0,
    "codigoBarras" TEXT,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    "categoriaId" TEXT NOT NULL,
    CONSTRAINT "Material_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Saldo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantidade" REAL NOT NULL DEFAULT 0,
    "reservado" REAL NOT NULL DEFAULT 0,
    "materialId" TEXT NOT NULL,
    "detentorId" TEXT NOT NULL,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "Saldo_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Saldo_detentorId_fkey" FOREIGN KEY ("detentorId") REFERENCES "Detentor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnidadeSerial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serial" TEXT NOT NULL,
    "macAddress" TEXT,
    "patrimonio" TEXT,
    "codigoBarras" TEXT,
    "lote" TEXT,
    "estadoFisico" TEXT NOT NULL DEFAULT 'NOVO',
    "status" TEXT NOT NULL DEFAULT 'DISPONIVEL',
    "valorUnitario" REAL,
    "clienteRef" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    "materialId" TEXT NOT NULL,
    "detentorId" TEXT,
    "entradaItemId" TEXT,
    CONSTRAINT "UnidadeSerial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UnidadeSerial_detentorId_fkey" FOREIGN KEY ("detentorId") REFERENCES "Detentor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UnidadeSerial_entradaItemId_fkey" FOREIGN KEY ("entradaItemId") REFERENCES "EntradaItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Entrada" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_RECEBIMENTO',
    "documento" TEXT,
    "lote" TEXT,
    "observacao" TEXT,
    "destinoId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebidoPorId" TEXT,
    "recebidoEm" DATETIME,
    CONSTRAINT "Entrada_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Detentor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entrada_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Entrada_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Entrada_recebidoPorId_fkey" FOREIGN KEY ("recebidoPorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntradaItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantidadePrevista" REAL NOT NULL,
    "quantidadeRecebida" REAL,
    "valorUnitario" REAL,
    "lote" TEXT,
    "entradaId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    CONSTRAINT "EntradaItem_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "Entrada" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntradaItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Divergencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "previsto" REAL NOT NULL,
    "recebido" REAL NOT NULL,
    "diferenca" REAL NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entradaItemId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    CONSTRAINT "Divergencia_entradaItemId_fkey" FOREIGN KEY ("entradaItemId") REFERENCES "EntradaItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Divergencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Movimentacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONCLUIDA',
    "motivo" TEXT,
    "observacao" TEXT,
    "origemId" TEXT,
    "destinoId" TEXT,
    "solicitanteId" TEXT,
    "responsavelId" TEXT NOT NULL,
    "ordemServicoId" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Movimentacao_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "Detentor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimentacao_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Detentor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimentacao_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimentacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Movimentacao_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovimentacaoItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantidade" REAL NOT NULL,
    "estadoFisico" TEXT,
    "valorUnitario" REAL,
    "movimentacaoId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    CONSTRAINT "MovimentacaoItem_movimentacaoId_fkey" FOREIGN KEY ("movimentacaoId") REFERENCES "Movimentacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MovimentacaoItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovimentacaoItemSerial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    CONSTRAINT "MovimentacaoItemSerial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MovimentacaoItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MovimentacaoItemSerial_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "UnidadeSerial" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Movimento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "quantidade" REAL NOT NULL,
    "valorUnitario" REAL,
    "observacao" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialId" TEXT NOT NULL,
    "unidadeId" TEXT,
    "origemId" TEXT,
    "destinoId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "entradaId" TEXT,
    "movimentacaoId" TEXT,
    "inventarioId" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "local" TEXT,
    "ordemServicoId" TEXT,
    CONSTRAINT "Movimento_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Movimento_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "UnidadeSerial" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimento_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "Detentor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimento_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Detentor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Movimento_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "Entrada" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimento_movimentacaoId_fkey" FOREIGN KEY ("movimentacaoId") REFERENCES "Movimentacao" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimento_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "Inventario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimento_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantidade" REAL NOT NULL,
    "finalidade" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "observacao" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" DATETIME,
    "encerradoEm" DATETIME,
    "materialId" TEXT NOT NULL,
    "detentorId" TEXT NOT NULL,
    "unidadeId" TEXT,
    "tecnicoId" TEXT,
    "equipeId" TEXT,
    "ordemServicoId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    CONSTRAINT "Reserva_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reserva_detentorId_fkey" FOREIGN KEY ("detentorId") REFERENCES "Detentor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reserva_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "UnidadeSerial" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reserva_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reserva_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reserva_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reserva_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Triagem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantidade" REAL NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO',
    "resultado" TEXT,
    "estadoRecebido" TEXT,
    "laudo" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" DATETIME,
    "materialId" TEXT NOT NULL,
    "unidadeId" TEXT,
    "origemMovimentacaoId" TEXT,
    "destinoId" TEXT,
    "responsavelId" TEXT,
    CONSTRAINT "Triagem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Triagem_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "UnidadeSerial" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Triagem_origemMovimentacaoId_fkey" FOREIGN KEY ("origemMovimentacaoId") REFERENCES "Movimentacao" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Triagem_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Detentor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Triagem_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Inventario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EM_CONTAGEM',
    "observacao" TEXT,
    "iniciadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEm" DATETIME,
    "detentorId" TEXT NOT NULL,
    "iniciadoPorId" TEXT NOT NULL,
    CONSTRAINT "Inventario_detentorId_fkey" FOREIGN KEY ("detentorId") REFERENCES "Detentor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Inventario_iniciadoPorId_fkey" FOREIGN KEY ("iniciadoPorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventarioItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantidadeSistema" REAL NOT NULL,
    "quantidadeContada" REAL,
    "diferenca" REAL,
    "ajustado" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "inventarioId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    CONSTRAINT "InventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "Inventario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventarioItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "antes" TEXT,
    "depois" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,
    CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "chave" TEXT NOT NULL PRIMARY KEY,
    "valor" TEXT NOT NULL,
    "descricao" TEXT,
    "atualizadoEm" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrdemServico" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idSgp" TEXT,
    "numero" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "subtipo" TEXT,
    "titulo" TEXT,
    "descricao" TEXT,
    "cliente" TEXT,
    "codigoCliente" TEXT,
    "contrato" TEXT,
    "endereco" TEXT,
    "bairroNome" TEXT,
    "cidade" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "abertaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prazo" DATETIME,
    "agendadaPara" DATETIME,
    "concluidaEm" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "severidade" TEXT NOT NULL DEFAULT 'MEDIA',
    "prioridade" TEXT NOT NULL DEFAULT 'P3',
    "sla" INTEGER,
    "setor" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'SGP',
    "atualizadoEm" DATETIME NOT NULL,
    "tecnicoId" TEXT,
    "equipeId" TEXT,
    "bairroId" TEXT,
    CONSTRAINT "OrdemServico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrdemServico_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrdemServico_bairroId_fkey" FOREIGN KEY ("bairroId") REFERENCES "Bairro" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialPrevistoOS" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quantidade" REAL NOT NULL,
    "ordemServicoId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    CONSTRAINT "MaterialPrevistoOS_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialPrevistoOS_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Regiao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bairro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "regiaoId" TEXT,
    "responsavelPrincipalId" TEXT,
    "responsavelSecundarioId" TEXT,
    "equipeId" TEXT,
    CONSTRAINT "Bairro_regiaoId_fkey" FOREIGN KEY ("regiaoId") REFERENCES "Regiao" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bairro_responsavelPrincipalId_fkey" FOREIGN KEY ("responsavelPrincipalId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bairro_responsavelSecundarioId_fkey" FOREIGN KEY ("responsavelSecundarioId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Bairro_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LocalizacaoTecnico" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "precisao" REAL,
    "statusOperacional" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'NAVEGADOR',
    "capturadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tecnicoId" TEXT NOT NULL,
    CONSTRAINT "LocalizacaoTecnico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Equipe_nome_key" ON "Equipe"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Tecnico_matricula_key" ON "Tecnico"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "Tecnico_usuarioId_key" ON "Tecnico"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Estoque_nome_key" ON "Estoque"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Detentor_estoqueId_key" ON "Detentor"("estoqueId");

-- CreateIndex
CREATE UNIQUE INDEX "Detentor_tecnicoId_key" ON "Detentor"("tecnicoId");

-- CreateIndex
CREATE UNIQUE INDEX "Detentor_equipeId_key" ON "Detentor"("equipeId");

-- CreateIndex
CREATE INDEX "Detentor_tipo_idx" ON "Detentor"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_nome_key" ON "Categoria"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_slug_key" ON "Categoria"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_nome_key" ON "Fornecedor"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Material_codigoInterno_key" ON "Material"("codigoInterno");

-- CreateIndex
CREATE INDEX "Material_categoriaId_idx" ON "Material"("categoriaId");

-- CreateIndex
CREATE INDEX "Material_nome_idx" ON "Material"("nome");

-- CreateIndex
CREATE INDEX "Saldo_detentorId_idx" ON "Saldo"("detentorId");

-- CreateIndex
CREATE UNIQUE INDEX "Saldo_materialId_detentorId_key" ON "Saldo"("materialId", "detentorId");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadeSerial_serial_key" ON "UnidadeSerial"("serial");

-- CreateIndex
CREATE INDEX "UnidadeSerial_materialId_idx" ON "UnidadeSerial"("materialId");

-- CreateIndex
CREATE INDEX "UnidadeSerial_detentorId_idx" ON "UnidadeSerial"("detentorId");

-- CreateIndex
CREATE INDEX "UnidadeSerial_status_idx" ON "UnidadeSerial"("status");

-- CreateIndex
CREATE INDEX "UnidadeSerial_macAddress_idx" ON "UnidadeSerial"("macAddress");

-- CreateIndex
CREATE INDEX "UnidadeSerial_patrimonio_idx" ON "UnidadeSerial"("patrimonio");

-- CreateIndex
CREATE UNIQUE INDEX "Entrada_numero_key" ON "Entrada"("numero");

-- CreateIndex
CREATE INDEX "Entrada_status_idx" ON "Entrada"("status");

-- CreateIndex
CREATE INDEX "Entrada_criadoEm_idx" ON "Entrada"("criadoEm");

-- CreateIndex
CREATE INDEX "EntradaItem_entradaId_idx" ON "EntradaItem"("entradaId");

-- CreateIndex
CREATE UNIQUE INDEX "Divergencia_entradaItemId_key" ON "Divergencia"("entradaItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Movimentacao_numero_key" ON "Movimentacao"("numero");

-- CreateIndex
CREATE INDEX "Movimentacao_tipo_idx" ON "Movimentacao"("tipo");

-- CreateIndex
CREATE INDEX "Movimentacao_criadoEm_idx" ON "Movimentacao"("criadoEm");

-- CreateIndex
CREATE INDEX "MovimentacaoItem_movimentacaoId_idx" ON "MovimentacaoItem"("movimentacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentacaoItemSerial_itemId_unidadeId_key" ON "MovimentacaoItemSerial"("itemId", "unidadeId");

-- CreateIndex
CREATE INDEX "Movimento_materialId_criadoEm_idx" ON "Movimento"("materialId", "criadoEm");

-- CreateIndex
CREATE INDEX "Movimento_unidadeId_criadoEm_idx" ON "Movimento"("unidadeId", "criadoEm");

-- CreateIndex
CREATE INDEX "Movimento_origemId_idx" ON "Movimento"("origemId");

-- CreateIndex
CREATE INDEX "Movimento_destinoId_idx" ON "Movimento"("destinoId");

-- CreateIndex
CREATE INDEX "Movimento_tipo_criadoEm_idx" ON "Movimento"("tipo", "criadoEm");

-- CreateIndex
CREATE INDEX "Movimento_criadoEm_idx" ON "Movimento"("criadoEm");

-- CreateIndex
CREATE INDEX "Reserva_status_idx" ON "Reserva"("status");

-- CreateIndex
CREATE INDEX "Reserva_materialId_detentorId_idx" ON "Reserva"("materialId", "detentorId");

-- CreateIndex
CREATE INDEX "Triagem_status_idx" ON "Triagem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Inventario_numero_key" ON "Inventario"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioItem_inventarioId_materialId_key" ON "InventarioItem"("inventarioId", "materialId");

-- CreateIndex
CREATE INDEX "Auditoria_entidade_entidadeId_idx" ON "Auditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "Auditoria_criadoEm_idx" ON "Auditoria"("criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemServico_idSgp_key" ON "OrdemServico"("idSgp");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemServico_numero_key" ON "OrdemServico"("numero");

-- CreateIndex
CREATE INDEX "OrdemServico_status_idx" ON "OrdemServico"("status");

-- CreateIndex
CREATE INDEX "OrdemServico_severidade_idx" ON "OrdemServico"("severidade");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialPrevistoOS_ordemServicoId_materialId_key" ON "MaterialPrevistoOS"("ordemServicoId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "Regiao_nome_key" ON "Regiao"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Bairro_nome_cidade_key" ON "Bairro"("nome", "cidade");

-- CreateIndex
CREATE INDEX "LocalizacaoTecnico_tecnicoId_capturadoEm_idx" ON "LocalizacaoTecnico"("tecnicoId", "capturadoEm");
