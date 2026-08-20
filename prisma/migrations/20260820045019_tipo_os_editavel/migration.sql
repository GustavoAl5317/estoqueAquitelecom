-- CreateTable
CREATE TABLE "TipoOS" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "valor" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "tom" TEXT NOT NULL DEFAULT 'neutro',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoOS_valor_key" ON "TipoOS"("valor");

-- Semente: os tipos que hoje vivem fixos em dominio.ts. `valor` é o mesmo
-- código já gravado em OrdemServico.tipo, então nenhuma OS existente muda de
-- tipo com esta migração — só passa a ser editável.
INSERT INTO "TipoOS" ("id", "valor", "rotulo", "tom", "ordem") VALUES
  (lower(hex(randomblob(16))), 'INSTALACAO', 'Instalação', 'informativo', 1),
  (lower(hex(randomblob(16))), 'REPARO', 'Reparo', 'atencao', 2),
  (lower(hex(randomblob(16))), 'MANUTENCAO', 'Manutenção', 'atencao', 3),
  (lower(hex(randomblob(16))), 'MUDANCA_ENDERECO', 'Mudança de endereço', 'roxo', 4),
  (lower(hex(randomblob(16))), 'RETIRADA', 'Retirada de equipamento', 'critico', 5),
  (lower(hex(randomblob(16))), 'UPGRADE', 'Upgrade de plano', 'positivo', 6),
  (lower(hex(randomblob(16))), 'VISTORIA', 'Vistoria', 'neutro', 7),
  (lower(hex(randomblob(16))), 'INFRAESTRUTURA', 'Infraestrutura', 'neutro', 8),
  (lower(hex(randomblob(16))), 'NAO_INFORMADO', 'Não informado', 'neutro', 9);
