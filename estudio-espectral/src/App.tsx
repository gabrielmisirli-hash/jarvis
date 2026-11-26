import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AboutTab } from './ui/AboutTab';
import { ExportTab } from './ui/ExportTab';
import { HistoryTab } from './ui/HistoryTab';
import { LibraryTab } from './ui/LibraryTab';
import { MixTab } from './ui/MixTab';
import { PhrasesTab } from './ui/PhrasesTab';
import { SpectroTab } from './ui/SpectroTab';
import { StudioProvider, useOnline, useStudio } from './ui/state';

const TABS = [
  { id: 'frases', label: 'Frases' },
  { id: 'espectro', label: 'Espectrograma' },
  { id: 'fundo', label: 'Fundo e mixer' },
  { id: 'exportar', label: 'Exportar' },
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'historico', label: 'Histórico e backup' },
  { id: 'sobre', label: 'Instalar e sobre' },
] as const;
type TabId = (typeof TABS)[number]['id'];

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

function Shell() {
  const [tab, setTab] = useState<TabId>(() => (location.hash.slice(1) as TabId) || 'frases');
  const { status, project } = useStudio();
  const online = useOnline();
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  const [cached, setCached] = useState(false);

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEvt(e as BeforeInstallPromptEvent); };
    addEventListener('beforeinstallprompt', h);
    // já controlado por um SW ativo = recursos em cache
    void navigator.serviceWorker?.ready.then(() => setCached(!!navigator.serviceWorker.controller));
    return () => removeEventListener('beforeinstallprompt', h);
  }, []);
  useEffect(() => { history.replaceState(null, '', '#' + tab); }, [tab]);

  const ready = offlineReady || cached;

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Estúdio Espectral</h1>
          <p className="muted">Imagem → som → espectrograma reconstruído · {project.name}</p>
        </div>
        <div className="flags">
          <span className={`badge ${online ? '' : 'warn'}`}>{online ? 'Online' : 'Offline'}</span>
          <span className={`badge ${ready ? 'ok' : ''}`} data-testid="offline-ready">{ready ? 'Pronto para modo avião' : 'Preparando offline…'}</span>
        </div>
      </header>
      {needRefresh && (
        <div className="update">
          Nova versão disponível. <button onClick={() => void updateServiceWorker(true)}>Atualizar</button>
        </div>
      )}
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'frases' && <PhrasesTab />}
        {tab === 'espectro' && <SpectroTab />}
        {tab === 'fundo' && <MixTab />}
        {tab === 'exportar' && <ExportTab />}
        {tab === 'biblioteca' && <LibraryTab />}
        {tab === 'historico' && <HistoryTab />}
        {tab === 'sobre' && <AboutTab offlineReady={ready} canInstall={!!installEvt} onInstall={() => void installEvt?.prompt()} />}
      </main>
      <footer className="status" role="status" aria-live="polite">{status}</footer>
    </div>
  );
}

export default function App() {
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  );
}
