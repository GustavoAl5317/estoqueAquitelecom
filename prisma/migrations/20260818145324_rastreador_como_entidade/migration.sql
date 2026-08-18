/*
  Warnings:

  - You are about to drop the `PosicaoVeiculo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `rastreador` on the `Veiculo` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PosicaoVeiculo_capturadoEm_idx";

-- DropIndex
DROP INDEX "PosicaoVeiculo_veiculoId_capturadoEm_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PosicaoVeiculo";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Rastreador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identificador" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'NAO_CLASSIFICADO',
    "modelo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    "veiculoId" TEXT,
    "tecnicoId" TEXT,
    "unidadeSerialId" TEXT,
    CONSTRAINT "Rastreador_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Rastreador_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Rastreador_unidadeSerialId_fkey" FOREIGN KEY ("unidadeSerialId") REFERENCES "UnidadeSerial" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Posicao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "velocidade" REAL,
    "ignicao" BOOLEAN,
    "endereco" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'RASTREADOR',
    "capturadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebidoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rastreadorId" TEXT NOT NULL,
    CONSTRAINT "Posicao_rastreadorId_fkey" FOREIGN KEY ("rastreadorId") REFERENCES "Rastreador" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Veiculo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placa" TEXT NOT NULL,
    "apelido" TEXT,
    "modelo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tecnicoAtualId" TEXT,
    "estoqueId" TEXT,
    CONSTRAINT "Veiculo_tecnicoAtualId_fkey" FOREIGN KEY ("tecnicoAtualId") REFERENCES "Tecnico" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Veiculo_estoqueId_fkey" FOREIGN KEY ("estoqueId") REFERENCES "Estoque" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Veiculo" ("apelido", "ativo", "criadoEm", "estoqueId", "id", "modelo", "placa", "tecnicoAtualId") SELECT "apelido", "ativo", "criadoEm", "estoqueId", "id", "modelo", "placa", "tecnicoAtualId" FROM "Veiculo";
DROP TABLE "Veiculo";
ALTER TABLE "new_Veiculo" RENAME TO "Veiculo";
CREATE UNIQUE INDEX "Veiculo_placa_key" ON "Veiculo"("placa");
CREATE UNIQUE INDEX "Veiculo_estoqueId_key" ON "Veiculo"("estoqueId");
CREATE INDEX "Veiculo_tecnicoAtualId_idx" ON "Veiculo"("tecnicoAtualId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Rastreador_identificador_key" ON "Rastreador"("identificador");

-- CreateIndex
CREATE UNIQUE INDEX "Rastreador_veiculoId_key" ON "Rastreador"("veiculoId");

-- CreateIndex
CREATE UNIQUE INDEX "Rastreador_tecnicoId_key" ON "Rastreador"("tecnicoId");

-- CreateIndex
CREATE UNIQUE INDEX "Rastreador_unidadeSerialId_key" ON "Rastreador"("unidadeSerialId");

-- CreateIndex
CREATE INDEX "Rastreador_tipo_idx" ON "Rastreador"("tipo");

-- CreateIndex
CREATE INDEX "Posicao_rastreadorId_capturadoEm_idx" ON "Posicao"("rastreadorId", "capturadoEm");

-- CreateIndex
CREATE INDEX "Posicao_capturadoEm_idx" ON "Posicao"("capturadoEm");
