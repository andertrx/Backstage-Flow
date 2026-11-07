import { CalendarCheck } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { useAgendaStatus, useConectarAgenda, useDesconectarAgenda } from "./api.ts";

/**
 * Etapa 46.1 — cada pessoa conecta o PRÓPRIO Google Agenda (fica em Reuniões e em Minha conta).
 * O CRM nunca vê a senha do Google: a pessoa autoriza no site do Google e a chave de acesso vai direto para o cofre do servidor.
 * Nesta fase só se conecta e desconecta; criar convites e ver a agenda vêm nas próximas fases.
 */
export function GoogleAgendaCard() {
  const status = useAgendaStatus();
  const conectar = useConectarAgenda();
  const desconectar = useDesconectarAgenda();
  const [msg, setMsg] = useState<string | null>(null);
  const c = status.data?.conexao;
  const ligada = c?.status === "conectada" || c?.status === "erro";
  return (
    <Card className="space-y-3 p-5" data-testid="google-agenda-card">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarCheck className="size-5 text-blue-600" aria-hidden />
        <h2 className="text-base font-semibold">Google Agenda</h2>
        {status.isLoading ? null : c?.status === "conectada" ? <Badge tone="success">Conectado</Badge> : c?.status === "erro" ? <Badge tone="danger">Precisa reconectar</Badge> : <Badge>Não conectado</Badge>}
      </div>
      {ligada ? (
        <p className="text-sm text-slate-600" data-testid="google-agenda-conectado">
          Conectado como <strong>{c?.google_email ?? "sua conta Google"}</strong> desde {formatDateTime(c!.connected_at)}.
          O CRM só acessa eventos da sua agenda e guarda a chave de acesso no cofre do servidor, nunca a sua senha.
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          Conecte a sua agenda para as reuniões do CRM aparecerem nela, com convite para os participantes e link do Google Meet. Você autoriza no site do Google e pode desconectar quando quiser.
        </p>
      )}
      {c?.status === "erro" && c.last_error && <Alert tone="warning">{c.last_error}</Alert>}
      {status.data && !status.data.configured && <Alert tone="warning">O login do Google ainda não foi configurado no servidor. Fale com o administrador.</Alert>}
      {(status.error || conectar.error || desconectar.error) && <Alert tone="error">{errorMessage(status.error ?? conectar.error ?? desconectar.error)}</Alert>}
      {msg && <Alert tone="success">{msg}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { setMsg(null); conectar.mutate(); }} loading={conectar.isPending} disabled={!status.data?.configured}>
          {ligada ? "Conectar de novo" : "Conectar minha agenda do Google"}
        </Button>
        {ligada && (
          <Button variant="ghost" loading={desconectar.isPending} onClick={() => desconectar.mutate(undefined, { onSuccess: () => setMsg("Agenda desconectada. A chave de acesso foi apagada do cofre.") })}>
            Desconectar
          </Button>
        )}
      </div>
    </Card>
  );
}
