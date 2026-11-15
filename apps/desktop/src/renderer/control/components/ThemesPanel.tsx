import { useTranslation } from 'react-i18next';
import {
  DEFAULT_THEME_IDS,
  makeScene,
  newId,
  nowIso,
  type Scene,
  type Theme,
} from '@lampstand/core';
import { Button } from '@lampstand/ui';
import { cmd } from '../lib/api';
import { attempt, EMPTY_RECORD, openDialog, useStore } from '../lib/store';
import { SceneView } from './SceneView';

export const sampleScene = (theme: Theme, text: string, reference?: string): Scene =>
  makeScene({
    // A theme with no background is previewed on neutral grey so its text stays readable.
    background: {
      ref:
        theme.background.kind === 'none' ? { kind: 'color', color: '#333845' } : theme.background,
    },
    content: {
      key: `sample-${theme.id}-${text.length}`,
      kind: 'lyrics',
      theme,
      blocks: [{ spans: [{ text }] }],
      ...(reference ? { reference } : {}),
    },
  });

export async function duplicateTheme(t: Theme): Promise<string | null> {
  const now = nowIso();
  const copy: Theme = {
    ...t,
    id: newId(),
    name: `${t.name} copy`,
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await attempt(() => cmd('theme.save', { entity: copy }), 'errors.duplicate');
  return saved === undefined ? null : copy.id;
}

export function ThemesPanel() {
  const { t } = useTranslation();
  const themes = useStore((s) => s.themes);
  const defaults = useStore((s) => s.settings?.defaultThemes ?? EMPTY_RECORD);
  const kinds = ['scripture', 'lyrics', 'text'] as const;
  const isDefault = (id: string, k: (typeof kinds)[number]): boolean =>
    (defaults[k] ?? DEFAULT_THEME_IDS[k]) === id;

  return (
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 overflow-y-auto px-4 pb-4">
      {themes.map((th) => (
        <div
          key={th.id}
          className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]"
        >
          <SceneView
            scene={sampleScene(th, 'Amazing grace, how sweet the sound', 'Sample')}
            mode="thumbnail"
          />
          <div className="flex items-center gap-1 px-3 pt-2.5">
            <span className="truncate font-medium">{th.name}</span>
            {th.builtIn && (
              <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-3)]">
                {t('theme.builtIn')}
              </span>
            )}
            <span className="ml-auto" />
            {th.builtIn ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void duplicateTheme(th).then(
                    (id) => id && openDialog('theme', { editingThemeId: id }),
                  )
                }
              >
                {t('theme.duplicate')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openDialog('theme', { editingThemeId: th.id })}
              >
                {t('library.edit')}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 px-3 pb-3 pt-1.5 text-[12px]">
            <span className="text-[var(--text-3)]">{t('theme.useFor')}:</span>
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={isDefault(th.id, k)}
                onClick={() =>
                  void cmd('settings.update', {
                    patch: { defaultThemes: { ...defaults, [k]: th.id } },
                  })
                }
                className={`rounded-[5px] px-2 py-0.5 font-medium transition-colors ${isDefault(th.id, k) ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-3)] text-[var(--text-2)] hover:text-[var(--text-1)]'}`}
              >
                {t(`theme.kinds.${k}`)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
