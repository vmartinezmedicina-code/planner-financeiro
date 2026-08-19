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
  // Tabela de controle: registra quais pastas de migration já foram
  // aplicadas neste banco, para nunca reaplicar (e nunca perder dados).
  await client.execute(
    "CREATE TABLE IF NOT EXISTS _deploy_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
  );

  const appliedRows = await client.execute("SELECT name FROM _deploy_migrations");
  const applied = new Set(appliedRows.rows.map((r) => String(r.name)));

  const migrationsDir = path.resolve(__dirname, "..", "prisma", "migrations");
  const folders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  let appliedCount = 0;
  for (const folder of folders) {
    if (applied.has(folder)) {
      console.log(`Já aplicada: ${folder} (pulando)`);
      continue;
    }
    const file = path.join(migrationsDir, folder, "migration.sql");
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, "utf-8");
    const statements = splitStatements(sql);
    console.log(`Aplicando ${folder} (${statements.length} instruções)...`);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
    await client.execute({
      sql: "INSERT INTO _deploy_migrations (name, applied_at) VALUES (?, ?)",
      args: [folder, new Date().toISOString()],
    });
    appliedCount++;
  }

  console.log(appliedCount > 0 ? `${appliedCount} migration(s) nova(s) aplicada(s).` : "Nada novo para aplicar — banco já está em dia.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.close());
