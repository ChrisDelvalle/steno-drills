import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../components';

export function TestSettings({ onClose, navigation, children }: { onClose: () => void; navigation: ReactNode; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (element.showModal) element.showModal();
    else element.setAttribute('open', '');
    return () => element.close?.();
  }, []);
  return <dialog ref={dialog} className="test-settings" aria-label="Test settings" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="settings-panel">
      <div className="settings-navigation">{navigation}<button className="icon-button" aria-label="Close settings" onClick={onClose}><Icon name="close"/></button></div>
      <div className="settings-content">{children}</div>
    </div>
  </dialog>;
}
