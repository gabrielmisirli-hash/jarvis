import { Note, Section } from './common';

export function AboutTab({ offlineReady, canInstall, onInstall }: { offlineReady: boolean; canInstall: boolean; onInstall: () => void }) {
  return (
    <>
      <Section title="Instalação e uso offline">
        <Note kind={offlineReady ? 'ok' : 'warn'}>
          {offlineReady ? 'Todos os recursos do app estão em cache neste aparelho: ele funciona em modo avião.' : 'Aguardando o primeiro carregamento completo para funcionar offline. Mantenha a internet ligada até esta mensagem mudar.'}
        </Note>
        {canInstall && <button className="primary" onClick={onInstall}>Instalar aplicativo</button>}
        <h3>Android (Chrome)</h3>
        <ol>
          <li>Abra o endereço HTTPS do app no Chrome e espere a mensagem “funciona em modo avião”.</li>
          <li>Toque em “Instalar aplicativo” (ou menu ⋮ → Instalar app / Adicionar à tela inicial).</li>
          <li>Abra pelo ícone. Teste: ative o modo avião, feche e reabra o app, gere e baixe um WAV.</li>
        </ol>
        <h3>iPhone / iPad (Safari)</h3>
        <ol>
          <li>Abra o endereço HTTPS no <b>Safari</b> e espere a mensagem de modo avião.</li>
          <li>Toque em Compartilhar (□↑) → <b>Adicionar à Tela de Início</b>.</li>
          <li>Abra pelo ícone. Arquivos gerados são entregues pelo menu Compartilhar → “Salvar em Arquivos”.</li>
        </ol>
        <p className="muted">O iOS não permite instalar um “instalador” arbitrário como um EXE: fora da App Store, a forma suportada é a PWA na Tela de Início. Os dados da PWA instalada ficam separados dos do Safari. Um app nativo (Capacitor) é possível numa fase posterior, sobre este mesmo código.</p>
        <h3>Windows (Edge ou Chrome)</h3>
        <ol>
          <li>Abra o endereço HTTPS; clique no ícone de instalar na barra de endereços (ou menu → Aplicativos → Instalar).</li>
          <li>O app aparece no Menu Iniciar e abre em janela própria, inclusive offline.</li>
        </ol>
        <p className="muted">Service workers exigem HTTPS (ou localhost). Abrir o index.html por file:// não instala nem funciona offline.</p>
      </Section>

      <Section title="Garantias e limites de armazenamento">
        <ul className="notes">
          <li><b>App instalado</b>: os arquivos do aplicativo ficam em cache; atualizações chegam quando houver internet.</li>
          <li><b>Seus dados</b> (projetos, músicas, histórico) ficam no IndexedDB do navegador, que pode ser apagado pelo usuário ou pelo sistema. Não há retenção “para sempre”.</li>
          <li><b>Backup ZIP</b> (aba Histórico) é a cópia que você controla. Guarde-o fora do aparelho.</li>
          <li>Arquivos exportados (áudio/ZIP) vão para Downloads/Arquivos: o navegador não pode escolher pastas arbitrárias sem sua ação.</li>
        </ul>
      </Section>


      <Section title="Licenças">
        <p>Código do Estúdio Espectral: MIT. Dependências: React (MIT), Dexie (Apache-2.0), fflate (MIT), Workbox via vite-plugin-pwa (MIT), codificador MP3 LAME via @breezystack/lamejs (LGPL-3.0, módulo separado e substituível), fontes Arimo e Roboto Condensed (SIL Open Font License 1.1, via Fontsource). FFT, STFT, codecs BMP/WAV/FLAC e filtros são implementação própria. Detalhes em docs/DECISOES_E_LIMITACOES.md.</p>
      </Section>
    </>
  );
}
