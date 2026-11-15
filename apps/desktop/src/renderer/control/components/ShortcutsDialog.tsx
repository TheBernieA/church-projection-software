import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Kbd } from '@lampstand/ui';
import { saveSettings } from '../lib/actions';
import { comboFromEvent, displayCombo, effectiveShortcuts } from '../lib/shortcuts';
import { useStore } from '../lib/store';
import { Dialog } from './Dialog';
import { DEFAULT_SHORTCUTS } from '../constants';
import { type ShortcutAction } from '../types';

/** Cheat sheet + remapping (§14.3). Click a shortcut, press the new keys. */
export function ShortcutsDialog() {
  const { t } = useTranslation();
  useStore((s) => s.settings?.shortcuts);
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const map = effectiveShortcuts();

  const record = (action: ShortcutAction, e: React.KeyboardEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (['Shift', 'Meta', 'Control', 'Alt'].includes(e.key)) return;
    const combo = comboFromEvent(e.nativeEvent);
    const current = useStore.getState().settings?.shortcuts ?? {};
    void saveSettings({ shortcuts: { ...current, [action]: combo } });
    setRecording(null);
  };

  return (
    <Dialog
      name="shortcuts"
      title={t('shortcuts.title')}
      footer={
        <Button variant="ghost" onClick={() => void saveSettings({ shortcuts: {} })}>
          {t('shortcuts.reset')}
        </Button>
      }
    >
      <table className="w-full">
        <tbody>
          {(Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]).map((a) => (
            <tr key={a} className="border-b border-[var(--border)] last:border-0">
              <td className="py-1.5">{t(`shortcuts.action.${a}`)}</td>
              <td className="py-1.5 text-right">
                <button
                  type="button"
                  className="rounded px-1 hover:bg-[var(--surface-2)]"
                  onClick={() => setRecording(a)}
                  onKeyDown={(e) => recording === a && record(a, e)}
                  onBlur={() => setRecording(null)}
                >
                  {recording === a ? (
                    <span className="text-[var(--accent)]">{t('shortcuts.press')}</span>
                  ) : (
                    <Kbd>{displayCombo(map[a])}</Kbd>
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
