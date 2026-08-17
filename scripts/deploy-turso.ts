import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Defina DATABASE_URL e TURSO_AUTH_TOKEN antes de rodar este script.");
  process.exit(1);
}

const client = createClient({ url, authToken });

function splitStatements(sql: string): string[] {
  // Remove comentários de linha e separa por ";" respeitando os blocos
  // PRAGMA/CREATE TABLE gerados pelo Prisma (não há ";" dentro de strings aqui).
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const migrationsDir = path.resolve(__dirname, "..", "prisma", "migrations");
  const folders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  for (const folder of folders) {
    const file = path.join(migrationsDir, folder, "migration.sql");
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, "utf-8");
    const statements = splitStatements(sql);
    console.log(`Aplicando ${folder} (${statements.length} instruções)...`);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
  }

  console.log("Migrations aplicadas com sucesso no Turso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.close());
