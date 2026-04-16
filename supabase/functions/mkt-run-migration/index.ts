// One-time migration runner — overwrite with migration SQL and deploy when needed.
// Currently a no-op placeholder after last migration was applied.
import postgres from "npm:postgres@3";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1 });

Deno.serve(async () => {
  try {
    // No pending migrations.
    await sql.end();
    return new Response(JSON.stringify({ ok: true, message: "No pending migrations" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    await sql.end();
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
