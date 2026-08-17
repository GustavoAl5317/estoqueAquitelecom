-- CreateTable
CREATE TABLE "Veiculo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placa" TEXT NOT NULL,
    "apelido" TEXT,
    "modelo" TEXT,
    "rastreador" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tecnicoAtualId" TEXT,
    "estoqueId" TEXT,
    CONSTRAINT "Veiculo_tecnicoAtualId_fkey" FOREIGN KEY ("tecnicoAtualId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Veiculo_estoqueId_fkey" FOREIGN KEY ("estoqueId") REFERENCES "Estoque" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VinculoVeiculo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inicio" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" DATETIME,
    "observacao" TEXT,
    "veiculoId" TEXT NOT NULL,
    "tecnicoId" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    CONSTRAINT "VinculoVeiculo_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VinculoVeiculo_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VinculoVeiculo_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PosicaoVeiculo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "velocidade" REAL,
    "ignicao" BOOLEAN,
    "endereco" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'RASTREADOR',
    "capturadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebidoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "veiculoId" TEXT NOT NULL,
    CONSTRAINT "PosicaoVeiculo_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Veiculo_placa_key" ON "Veiculo"("placa");

-- CreateIndex
CREATE UNIQUE INDEX "Veiculo_rastreador_key" ON "Veiculo"("rastreador");

-- CreateIndex
CREATE UNIQUE INDEX "Veiculo_estoqueId_key" ON "Veiculo"("estoqueId");

-- CreateIndex
CREATE INDEX "Veiculo_tecnicoAtualId_idx" ON "Veiculo"("tecnicoAtualId");

-- CreateIndex
CREATE INDEX "VinculoVeiculo_veiculoId_inicio_idx" ON "VinculoVeiculo"("veiculoId", "inicio");

-- CreateIndex
CREATE INDEX "VinculoVeiculo_tecnicoId_inicio_idx" ON "VinculoVeiculo"("tecnicoId", "inicio");

-- CreateIndex
CREATE INDEX "PosicaoVeiculo_veiculoId_capturadoEm_idx" ON "PosicaoVeiculo"("veiculoId", "capturadoEm");

-- CreateIndex
CREATE INDEX "PosicaoVeiculo_capturadoEm_idx" ON "PosicaoVeiculo"("capturadoEm");
