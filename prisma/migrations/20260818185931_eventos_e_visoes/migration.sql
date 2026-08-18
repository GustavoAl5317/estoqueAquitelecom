-- CreateTable
CREATE TABLE "EventoOS" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" TEXT,
    "ocorreuEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ordemServicoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    CONSTRAINT "EventoOS_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventoOS_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisaoSalva" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "tela" TEXT NOT NULL,
    "filtros" TEXT NOT NULL,
    "compartilhada" BOOLEAN NOT NULL DEFAULT false,
    "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadaPorId" TEXT NOT NULL,
    CONSTRAINT "VisaoSalva_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EventoOS_ordemServicoId_ocorreuEm_idx" ON "EventoOS"("ordemServicoId", "ocorreuEm");

-- CreateIndex
CREATE INDEX "EventoOS_tipo_idx" ON "EventoOS"("tipo");

-- CreateIndex
CREATE INDEX "VisaoSalva_tela_idx" ON "VisaoSalva"("tela");

-- CreateIndex
CREATE UNIQUE INDEX "VisaoSalva_criadaPorId_tela_nome_key" ON "VisaoSalva"("criadaPorId", "tela", "nome");
