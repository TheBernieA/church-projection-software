import { useMemo, useRef, useState } from 'react';
import { Check, Download, Plus, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_THEME_IDS,
  KEY_COLORS,
  makeScene,
  newId,
  nowIso,
  omit,
  ThemeSchema,
  type KindThemes,
  type Scene,
  type Theme,
  type ThemeKind,
} from '@lampstand/core';
import { Button, IconButton, Segmented, Typography } from '@lampstand/ui';
import { saveSettings } from '../lib/actions';
import { cmd } from '../lib/api';
import { attempt, openDialog, toast, useStore } from '../lib/store';
import { SceneView } from './SceneView';
import { Badge } from './cards';
import { EMPTY_RECORD } from '../constants';

export const sampleScene = (
  theme: Theme,
  text: string,
  reference?: string,
  /** What to show behind a theme that has no background of its own. */
  backdrop = '#333845',
): Scene =>
  makeScene({
    // A theme with no background is previewed on a flat colour so its text stays readable.
    background: {
      ref: theme.background.kind === 'none' ? { kind: 'color', color: backdrop } : theme.background,
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

/** Save a theme as a file, to carry to another computer. */
function exportTheme(theme: Theme): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${theme.name.replace(/[^\w .-]+/g, '').trim() || 'theme'}.lstheme`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Add a theme from a file made by Export (it joins the library as a new theme). */
async function importTheme(file: File): Promise<string | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return null;
  }
  const now = nowIso();
  const r = ThemeSchema.safeParse({
    ...(typeof parsed === 'object' && parsed ? parsed : {}),
    id: newId(),
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  });
  if (!r.success) return null;
  const saved = await attempt(() => cmd('theme.save', { entity: r.data }), 'errors.save');
  return saved === undefined ? null : r.data.name;
}

type Output = 'main' | 'alternate' | 'stream';
type Layout = 'full' | 'lowerThird';
const OUTPUTS: Output[] = ['main', 'alternate', 'stream'];
const KINDS: ThemeKind[] = ['scripture', 'lyrics', 'text'];
const SAMPLE: Record<ThemeKind, [string, string | undefined]> = {
  scripture: ['For God so loved the world, that he gave his only begotten Son', 'John 3:16'],
  lyrics: ['Amazing grace, how sweet the sound', undefined],
  text: ['Welcome', undefined],
};

/** A labelled choice in the bar above the gallery. */
function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Typography variant="overline">{label}</Typography>
      {children}
    </div>
  );
}

/** One theme in the gallery: its preview (ticked when in use), name, and its own actions. */
function ThemeTile({
  theme,
  selected,
  sample,
  backdrop,
  onPick,
}: {
  theme: Theme;
  selected: boolean;
  sample: [string, string | undefined];
  backdrop: string;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-theme={theme.id}
      data-selected={selected}
      className={`overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] transition-shadow ${
        selected
          ? 'shadow-[0_0_0_2px_var(--accent)]'
          : 'shadow-[var(--shadow-1)] hover:shadow-[0_0_0_1px_var(--hairline-strong)]'
      }`}
    >
      <Button
        variant="bare"
        aria-pressed={selected}
        aria-label={t('theme.useTheme', { name: theme.name })}
        onClick={onPick}
        className="relative block w-full"
      >
        <SceneView scene={sampleScene(theme, sample[0], sample[1], backdrop)} mode="thumbnail" />
        {selected && (
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
            <Check size={13} strokeWidth={3} />
          </span>
        )}
      </Button>
      <div className="flex items-center gap-1 px-3 py-2">
        <Typography weight="medium" truncate className="min-w-0">
          {theme.name}
        </Typography>
        {theme.builtIn && <Badge>{t('theme.builtIn')}</Badge>}
        <span className="ml-auto" />
        {theme.builtIn ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              void duplicateTheme(theme).then(
                (id) => id && openDialog('theme', { editingThemeId: id }),
              )
            }
          >
            {t('theme.duplicate')}
          </Button>
        ) : (
          <>
            <IconButton
              size="xs"
              aria-label={t('theme.exportOf', { name: theme.name })}
              onClick={() => exportTheme(theme)}
            >
              <Download size={13} />
            </IconButton>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => openDialog('theme', { editingThemeId: theme.id })}
            >
              {t('library.edit')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Themes, for the whole app: pick an output (the main screens, the alternate HDMI output, the
 * stream), a kind of slide and a layout, then click a theme to use it there. The alternate
 * output and the stream follow the main screens until they are given a theme of their own.
 */
export function ThemesPanel() {
  const { t } = useTranslation();
  const themes = useStore((s) => s.themes);
  const defaults = useStore((s) => s.settings?.defaultThemes ?? EMPTY_RECORD) as KindThemes;
  const outputThemes = useStore((s) => s.settings?.outputThemes);
  const keyMode = useStore((s) => s.settings?.keyFeed.mode ?? 'off');
  const [output, setOutput] = useState<Output>('main');
  const [kind, setKind] = useState<ThemeKind>('scripture');
  const [layout, setLayout] = useState<Layout>('full');
  const file = useRef<HTMLInputElement>(null);

  const own = output === 'main' ? undefined : outputThemes?.[output][kind];
  const mainId = defaults[kind] ?? DEFAULT_THEME_IDS[kind];
  /** The theme in use on this output for this kind of slide. */
  const current = output === 'main' ? mainId : own;
  const pick = (id: string | undefined): void => {
    if (output === 'main') {
      if (id) void saveSettings({ defaultThemes: { ...defaults, [kind]: id } });
      return;
    }
    if (!outputThemes) return;
    const next = id ? { ...outputThemes[output], [kind]: id } : omit(outputThemes[output], kind);
    void saveSettings({ outputThemes: { ...outputThemes, [output]: next } });
  };

  const shown = useMemo(
    () => themes.filter((th) => (th.layout === 'lower-third') === (layout === 'lowerThird')),
    [themes, layout],
  );
  const builtIn = shown.filter((th) => th.builtIn);
  const mine = shown.filter((th) => !th.builtIn);
  // The alternate output as a key feed: preview over the colour it will have.
  const backdrop = output === 'alternate' && keyMode !== 'off' ? KEY_COLORS[keyMode] : '#333845';
  const grid = 'grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3';
  const tile = (th: Theme) => (
    <ThemeTile
      key={th.id}
      theme={th}
      selected={current === th.id}
      sample={SAMPLE[kind]}
      backdrop={backdrop}
      onPick={() => pick(th.id)}
    />
  );
  const mainTheme = themes.find((th) => th.id === mainId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-[var(--hairline)] px-4 pb-3.5">
        <Choice label={t('theme.output')}>
          <Segmented<Output>
            label={t('theme.output')}
            value={output}
            onChange={setOutput}
            options={OUTPUTS.map((o) => ({ value: o, label: t(`theme.outputs.${o}`) }))}
          />
        </Choice>
        <Choice label={t('theme.for')}>
          <Segmented<ThemeKind>
            label={t('theme.for')}
            value={kind}
            onChange={setKind}
            options={KINDS.map((k) => ({ value: k, label: t(`theme.kinds.${k}`) }))}
          />
        </Choice>
        <Choice label={t('theme.layoutFilter')}>
          <Segmented<Layout>
            label={t('theme.layoutFilter')}
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'full', label: t('theme.layouts.full') },
              { value: 'lowerThird', label: t('theme.layouts.lowerThird') },
            ]}
          />
        </Choice>
        <span className="flex-1" />
        <input
          ref={file}
          type="file"
          accept=".lstheme,application/json"
          hidden
          aria-label={t('theme.import')}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (f)
              void importTheme(f).then((name) =>
                toast(name ? t('theme.imported', { name }) : t('theme.importFailed')),
              );
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          icon={<Upload size={14} />}
          onClick={() => file.current?.click()}
        >
          {t('theme.import')}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <Typography as="p" size={12} tone="secondary" leading="snug" className="mb-3 max-w-[70ch]">
          {t(`theme.outputHelp.${output}`, { kind: t(`theme.kinds.${kind}`).toLowerCase() })}
        </Typography>

        {output !== 'main' && (
          <div className={`${grid} mb-4`}>
            <div
              className={`overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] ${
                !own ? 'shadow-[0_0_0_2px_var(--accent)]' : 'shadow-[var(--shadow-1)]'
              }`}
            >
              <Button
                variant="bare"
                aria-pressed={!own}
                aria-label={t('theme.sameAsMain')}
                onClick={() => pick(undefined)}
                className="relative block w-full"
              >
                {mainTheme && (
                  <SceneView
                    scene={sampleScene(mainTheme, SAMPLE[kind][0], SAMPLE[kind][1], backdrop)}
                    mode="thumbnail"
                  />
                )}
                {!own && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
              </Button>
              <div className="px-3 py-2">
                <Typography as="p" weight="medium">
                  {t('theme.sameAsMain')}
                </Typography>
                <Typography as="p" size={11} tone="muted" truncate>
                  {mainTheme?.name}
                </Typography>
              </div>
            </div>
          </div>
        )}

        <Typography as="h3" variant="overline" className="pb-2">
          {t('theme.builtInGroup')}
        </Typography>
        {builtIn.length ? (
          <div className={grid}>{builtIn.map(tile)}</div>
        ) : (
          <Typography as="p" size={12} tone="muted">
            {t('theme.noneForLayout')}
          </Typography>
        )}

        <Typography as="h3" variant="overline" className="pb-2 pt-5">
          {t('theme.library', { count: mine.length })}
        </Typography>
        {mine.length ? (
          <div className={grid}>{mine.map(tile)}</div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--hairline-strong)] px-6 py-8 text-center">
            <Typography size={12} tone="muted" leading="snug" className="max-w-[52ch]">
              {t('theme.libraryEmpty')}
            </Typography>
            <Button
              size="xs"
              variant="ghost"
              icon={<Plus size={13} />}
              onClick={() => file.current?.click()}
            >
              {t('theme.import')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
