// No pending migrations
Deno.serve(async () => {
  return new Response(JSON.stringify({ ok: true, message: 'no-op' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
