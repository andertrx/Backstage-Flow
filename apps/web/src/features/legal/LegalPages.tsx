import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "@/components/layout/Logo.tsx";

const UPDATED = "22/10/2026";

/** Moldura das páginas públicas (sem login): Política de Privacidade e Termos de Serviço. */
function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50 px-4 py-10">
      <article className="mx-auto max-w-3xl space-y-6 rounded-xl bg-white p-6 ring-1 ring-slate-200 sm:p-10" data-testid="legal-page">
        <header className="space-y-4 border-b border-slate-100 pb-6">
          <Link to="/login" className="inline-block" aria-label="Ir para a entrada do Backstage Flow"><Logo size="lg" /></Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">Backstage Flow · última atualização em {UPDATED}</p>
          </div>
        </header>
        <div className="space-y-6 text-sm leading-relaxed text-slate-700">{children}</div>
        <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-6 text-sm">
          <Link to="/privacidade" className="font-medium text-brand-600 hover:text-brand-700">Política de Privacidade</Link>
          <Link to="/termos" className="font-medium text-brand-600 hover:text-brand-700">Termos de Serviço</Link>
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">Entrar</Link>
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

const List = ({ items }: { items: ReactNode[] }) => (
  <ul className="list-disc space-y-1 pl-5">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
);

export function PrivacyPage() {
  return (
    <LegalLayout title="Política de Privacidade">
      <p>
        O Backstage Flow é um sistema de gestão (CRM) usado por uma agência de tráfego pago para acompanhar as campanhas de
        anúncios dos seus clientes. Esta política explica quais dados o sistema usa, para quê, como são protegidos e como
        pedir a remoção. Ela segue a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).
      </p>

      <Section title="1. Quem pode usar">
        <p>
          O acesso é restrito a pessoas autorizadas pela agência (equipe e clientes convidados). Não há cadastro aberto ao público.
        </p>
      </Section>

      <Section title="2. Dados que usamos">
        <List items={[
          <><strong>Conta de acesso:</strong> nome, e-mail e papel de cada usuário, para login e controle de permissões.</>,
          <><strong>Contas de anúncios (Meta Ads e Google Ads):</strong> com a autorização do responsável, lemos pelas APIs oficiais
            a estrutura das campanhas, conjuntos e anúncios, as métricas de desempenho (investimento, impressões, cliques,
            resultados) e informações de saldo e pagamento das contas.</>,
          <><strong>Planilhas do Google Sheets:</strong> quando configurado, lemos (só leitura) a planilha de contatos indicada
            pela agência para contar perfis e origens. O nome do contato não é lido; o telefone é guardado apenas como uma
            impressão digital irreversível (hash SHA-256).</>,
          <><strong>Rastreamento de site (quando instalado):</strong> eventos de visita e conversão; dados que identificam uma
            pessoa (e-mail, telefone) são transformados em hash SHA-256 no navegador antes de chegar ao sistema.</>,
          <><strong>WhatsApp:</strong> o texto das conversas nunca é guardado.</>,
        ]} />
      </Section>

      <Section title="3. Para que usamos">
        <List items={[
          "Mostrar painéis, relatórios, alertas e comparativos de desempenho das campanhas para a agência e seus clientes.",
          "Avisar sobre problemas nas contas (saldo baixo, anúncios parados, falhas de sincronização).",
          "Organizar o trabalho interno da agência (tarefas, clientes, reuniões).",
        ]} />
        <p>Não vendemos, alugamos nem compartilhamos dados com terceiros para publicidade. Não usamos os dados para treinar modelos de inteligência artificial.</p>
      </Section>

      <Section title="4. Dados recebidos das APIs do Google">
        <p>
          O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs do Google seguem a{" "}
          <a className="font-medium text-brand-600 hover:text-brand-700" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Política de Dados do Usuário dos Serviços de API do Google</a>, incluindo os requisitos de Uso Limitado.
        </p>
        <p>
          Os dados do Google Ads e do Google Sheets são usados somente para as funções descritas acima, dentro do próprio
          Backstage Flow. Não são transferidos a terceiros, exceto quando necessário para operar o serviço (hospedagem e banco
          de dados), quando exigido por lei ou com autorização expressa do usuário.
        </p>
      </Section>

      <Section title="5. Como protegemos">
        <List items={[
          "Tokens de acesso e chaves das integrações ficam guardados em cofre criptografado no servidor e nunca aparecem no site.",
          "Cada usuário só vê os clientes e as funções liberados para ele; as permissões são conferidas no banco de dados.",
          "A conexão com o sistema é sempre criptografada (HTTPS).",
        ]} />
      </Section>

      <Section title="6. Por quanto tempo guardamos">
        <p>
          Métricas e histórico das campanhas ficam guardados enquanto a agência atender o cliente, para permitir comparações
          ao longo do tempo. Da planilha do Google Sheets fica guardada só a última leitura. Tokens de acesso são apagados
          quando a conexão é removida.
        </p>
      </Section>

      <Section title="7. Como revogar o acesso e pedir a remoção">
        <List items={[
          <>A conexão com o Meta ou o Google pode ser removida a qualquer momento em Configurações → Integrações, no próprio sistema.</>,
          <>O acesso da conta Google também pode ser revogado em{" "}
            <a className="font-medium text-brand-600 hover:text-brand-700" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.</>,
          <>Para pedir acesso, correção ou exclusão dos seus dados (direitos da LGPD), fale com a agência pelo canal de
            atendimento que você já usa ou pelo e-mail de suporte informado na tela de autorização do Google.</>,
        ]} />
      </Section>

      <Section title="8. Mudanças nesta política">
        <p>Esta política pode ser atualizada. A data da última atualização fica no topo desta página.</p>
      </Section>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Termos de Serviço">
      <p>
        Estes termos valem para o uso do Backstage Flow, sistema de gestão (CRM) de uma agência de tráfego pago. Ao entrar no
        sistema, você concorda com eles.
      </p>

      <Section title="1. O serviço">
        <p>
          O Backstage Flow reúne dados de campanhas de anúncios (como Meta Ads e Google Ads), planilhas autorizadas e
          informações internas da agência para mostrar painéis, relatórios, alertas e organizar o trabalho da equipe.
        </p>
      </Section>

      <Section title="2. Quem pode usar">
        <List items={[
          "Somente pessoas com acesso criado pela agência (equipe e clientes convidados).",
          "Cada pessoa é responsável por manter a própria senha em segredo e por avisar a agência se suspeitar de uso indevido.",
          "O acesso pode ser suspenso ou removido pela agência a qualquer momento.",
        ]} />
      </Section>

      <Section title="3. Conexões com Meta, Google e outras plataformas">
        <List items={[
          "Ao conectar uma conta, você confirma que tem permissão para autorizar o acesso a ela.",
          "O sistema só lê os dados necessários para as funções descritas na Política de Privacidade.",
          "O uso dessas plataformas continua sujeito aos termos de cada uma delas.",
        ]} />
      </Section>

      <Section title="4. Dados exibidos">
        <p>
          Os números vêm das APIs oficiais das plataformas e das planilhas autorizadas. Quando uma informação não está
          disponível, o sistema mostra "—" em vez de estimar. Podem ocorrer atrasos ou diferenças causados pelas próprias
          plataformas; as decisões tomadas com base nos dados são de responsabilidade de quem as toma.
        </p>
      </Section>

      <Section title="5. Uso proibido">
        <List items={[
          "Tentar acessar dados de clientes ou funções que não foram liberados para você.",
          "Copiar, revender ou divulgar dados de clientes sem autorização.",
          "Interferir no funcionamento ou na segurança do sistema.",
        ]} />
      </Section>

      <Section title="6. Disponibilidade e responsabilidade">
        <p>
          Trabalhamos para manter o sistema disponível e seguro, mas ele pode passar por manutenções ou interrupções. Na
          medida permitida pela lei, a agência não responde por perdas indiretas decorrentes de indisponibilidade ou de falhas
          das plataformas de terceiros.
        </p>
      </Section>

      <Section title="7. Privacidade">
        <p>
          O tratamento de dados pessoais segue a <Link to="/privacidade" className="font-medium text-brand-600 hover:text-brand-700">Política de Privacidade</Link>.
        </p>
      </Section>

      <Section title="8. Mudanças e lei aplicável">
        <p>
          Estes termos podem ser atualizados; a data da última atualização fica no topo desta página. Eles são regidos pelas
          leis da República Federativa do Brasil.
        </p>
      </Section>
    </LegalLayout>
  );
}
