import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Local (dev): DATABASE_URL="file:./dev.db" -> usa o engine clássico do
// Prisma direto no arquivo SQLite (mais estável para filtros de data).
// Produção (Vercel): DATABASE_URL="libsql://SEU-BANCO.turso.io" + TURSO_AUTH_TOKEN
// -> Turso, um banco compatível com SQLite que persiste em serverless.
// Só usamos o adapter libSQL quando a URL realmente aponta para o Turso.
function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const isTurso = url.startsWith("libsql:");

  if (isTurso) {
    const adapter = new PrismaLibSQL({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    return new PrismaClient({ adapter, log: ["error"] });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
