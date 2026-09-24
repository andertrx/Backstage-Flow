/** Mostrado quando o site foi publicado sem as variáveis do Supabase. */
export function MissingConfig() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-md rounded-xl bg-white p-6 text-sm shadow-sm ring-1 ring-slate-200">
        <h1 className="mb-2 text-base font-semibold">Configuração incompleta</h1>
        <p className="text-slate-600">
          Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (veja{" "}
          <code>apps/web/.env.example</code>).
        </p>
      </div>
    </div>
  );
}
