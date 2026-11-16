import { useTranslation } from 'react-i18next';
import {
  DEFAULT_THEME_IDS,
  makeScene,
  newId,
  nowIso,
  type Scene,
  type Theme,
} from '@lampstand/core';
import { Button, Typography } from '@lampstand/ui';
import { saveSettings } from '../lib/actions';
import { cmd } from '../lib/api';
import { attempt, openDialog, useStore } from '../lib/store';
import { SceneView } from './SceneView';
import { Badge } from './cards';
import { EMPTY_RECORD } from '../constants';

export const sampleScene = (theme: Theme, text: string, reference?: string): Scene =>
  makeScene({
    // A theme with no background is previewed on neutral grey so its text stays readable.
    background: {
      ref:
        theme.background.kind === 'none' ? { kind: 'color', color: '#333845' } : theme.background,
      ...(theme.backgroundAdjust ? { adjust: theme.backgroundAdjust } : {}),
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
            <Typography weight="medium" truncate>
              {th.name}
            </Typography>
            {th.builtIn && <Badge>{t('theme.builtIn')}</Badge>}
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
          <Typography
            as="div"
            size={12}
            className="flex flex-wrap items-center gap-1 px-3 pb-3 pt-1.5"
          >
            <Typography tone="muted">{t('theme.useFor')}:</Typography>
            {kinds.map((k) => (
              <Button
                key={k}
                size="3xs"
                variant={isDefault(th.id, k) ? 'primary' : 'secondary'}
                aria-pressed={isDefault(th.id, k)}
                onClick={() => void saveSettings({ defaultThemes: { ...defaults, [k]: th.id } })}
              >
                {t(`theme.kinds.${k}`)}
              </Button>
            ))}
          </Typography>
        </div>
      ))}
    </div>
  );
}
