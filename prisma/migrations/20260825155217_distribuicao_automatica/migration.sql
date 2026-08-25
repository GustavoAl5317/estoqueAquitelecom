-- CreateTable
CREATE TABLE "_TipoOSTecnico" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TipoOSTecnico_A_fkey" FOREIGN KEY ("A") REFERENCES "Tecnico" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TipoOSTecnico_B_fkey" FOREIGN KEY ("B") REFERENCES "TipoOS" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tecnico" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "telefone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISPONIVEL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebeAutomatico" BOOLEAN NOT NULL DEFAULT true,
    "equipeId" TEXT,
    "usuarioId" TEXT,
    CONSTRAINT "Tecnico_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tecnico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tecnico" ("ativo", "criadoEm", "equipeId", "id", "matricula", "nome", "status", "telefone", "usuarioId") SELECT "ativo", "criadoEm", "equipeId", "id", "matricula", "nome", "status", "telefone", "usuarioId" FROM "Tecnico";
DROP TABLE "Tecnico";
ALTER TABLE "new_Tecnico" RENAME TO "Tecnico";
CREATE UNIQUE INDEX "Tecnico_matricula_key" ON "Tecnico"("matricula");
CREATE UNIQUE INDEX "Tecnico_usuarioId_key" ON "Tecnico"("usuarioId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "_TipoOSTecnico_AB_unique" ON "_TipoOSTecnico"("A", "B");

-- CreateIndex
CREATE INDEX "_TipoOSTecnico_B_index" ON "_TipoOSTecnico"("B");
