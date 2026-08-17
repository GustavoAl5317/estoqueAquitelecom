import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * O caminho do banco é resolvido a partir da raiz do projeto para que o
 * runtime da aplicação e a CLI do Prisma apontem sempre para o mesmo arquivo,
 * independentemente do diretório de trabalho de quem executou o processo.
 */
const arquivo =
  process.env.DATABASE_FILE ?? path.join(process.cwd(), "prisma", "dev.db");

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${arquivo}` }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
