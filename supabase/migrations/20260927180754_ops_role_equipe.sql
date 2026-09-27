-- Etapa 36.1: papel "equipe" (Design, Copy, Social Media, Dev, Áudio e Vídeo...):
-- usa só a Central de Operações. Não vê anúncios, contas, métricas nem relatórios.
alter type public.user_role add value if not exists 'equipe';
