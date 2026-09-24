-- Deixa explícito que oauth_states é inacessível pelo site (resolve o aviso
-- "RLS Enabled No Policy" do Supabase Advisor). Só o servidor (service_role) usa.
create policy "Ninguém acessa pelo site"
  on public.oauth_states for all to anon, authenticated
  using (false) with check (false);
