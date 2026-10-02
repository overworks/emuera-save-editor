import { useSyncExternalStore } from 'react';
import { ArrowDownToLine, Check, RefreshCw } from 'lucide-react';
import { useLocale } from './locale';
import { checkOffline, getOfflineStatus, installApp, subscribeOffline } from './pwa';

export function OfflineApp() {
  const { t } = useLocale();
  const status = useSyncExternalStore(subscribeOffline, getOfflineStatus);
  return <section className="offline-panel" aria-label={t('offlineApp')}>
    <details className="offline-details">
      <summary><span aria-live="polite">{t(status.phase === 'ready' ? 'offlineReady' : status.phase === 'preparing' ? 'offlinePreparing' : status.phase === 'unavailable' ? 'offlineUnavailable' : 'offlineFailed')}</span><span className="offline-more">{t('offlineApp')}</span></summary>
      <div className="offline-description">
        <p>{t('offlineHint')}</p><p>{t('offlineRecoveryHint')}</p>
        {!status.installed && <p>{t('installHint')}</p>}
        {status.phase === 'unavailable' && <p>{t('offlineRequirements')}</p>}
        {status.phase !== 'unavailable' && <button className="text-button" disabled={status.checking || status.phase === 'preparing'} onClick={() => void checkOffline(status.phase === 'error')}><RefreshCw size={14} className={status.checking ? 'spin' : undefined} />{t(status.phase === 'error' ? 'retryOffline' : 'checkForUpdate')}</button>}
      </div>
    </details>
    {status.installable && <button className="button secondary install-button" onClick={() => void installApp()}><ArrowDownToLine size={15} />{t('installApp')}</button>}
    {status.installed && <span className="installed-label"><Check size={14} />{t('appInstalled')}</span>}
    {status.updateReady && <div className="offline-update" aria-live="polite"><strong>{t('updateReady')}</strong><p>{t('updateHint')}</p></div>}
    {status.updateFailed && !status.updateReady && <p className="offline-error" aria-live="polite">{t('updateFailed')}</p>}
    {status.installFailed && <p className="offline-error" aria-live="polite">{t('installFailed')}</p>}
  </section>;
}
