import { applyPendingMigrations, inspectMigrations } from "./client.js";
import { resolveMigrationConnection } from "./migration-runtime.js";

async function stopWithTimeout(stop: () => Promise<void>): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  let timedOut = false;

  try {
    await Promise.race([
      stop(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          timedOut = true;
          resolve();
        }, 5_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (timedOut) {
    console.warn("Timed out while stopping embedded PostgreSQL after migrations; continuing startup.");
  }
}

async function main(): Promise<void> {
  const resolved = await resolveMigrationConnection();

  console.log(`Migrating database via ${resolved.source}`);

  try {
    const before = await inspectMigrations(resolved.connectionString);
    if (before.status === "upToDate") {
      console.log("No pending migrations");
      return;
    }

    console.log(`Applying ${before.pendingMigrations.length} pending migration(s)...`);
    await applyPendingMigrations(resolved.connectionString);

    const after = await inspectMigrations(resolved.connectionString);
    if (after.status !== "upToDate") {
      throw new Error(`Migrations incomplete: ${after.pendingMigrations.join(", ")}`);
    }
    console.log("Migrations complete");
  } finally {
    await stopWithTimeout(resolved.stop);
  }
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
