import { useMemo, useRef, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Download, Plus, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import {
  DEFAULT_THEME_IDS,
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
import { ITEM_CLASS, MENU_CLASS } from './menu';
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

/** A theme of your own, made from `t` (not saved yet). */
export function themeCopy(t: Theme): Theme {
  const now = nowIso();
  return {
    ...t,
    id: newId(),
    name: i18n.t('theme.copyName', { name: t.name }),
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  };
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
  // After the download has picked it up.
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Typography variant="overline">{label}</Typography>
      {children}
    </div>
  );
}

/**
 * One theme in the gallery. Clicking it asks where to use it: every output, or just one. The
 * outputs using it for this kind of slide are named on its picture.
 */
function ThemeTile({
  theme,
  usedBy,
  kindName,
  sample,
  onUse,
}: {
  theme: Theme;
  /** The outputs that use this theme for the kind of slide being chosen. */
  usedBy: Output[];
  kindName: string;
  sample: [string, string | undefined];
  onUse: (where: Output | 'all') => void;
}) {
  const { t } = useTranslation();
  // Built once per theme and sample (a new scene each render would redraw every thumbnail).
  const [first, second] = sample;
  const scene = useMemo(() => sampleScene(theme, first, second), [theme, first, second]);
  const used = usedBy.length > 0;
  return (
    <div
      data-theme={theme.id}
      data-selected={used}
      className={`overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] transition-shadow ${
        used
          ? 'shadow-[0_0_0_2px_var(--accent)]'
          : 'shadow-[var(--shadow-1)] hover:shadow-[0_0_0_1px_var(--hairline-strong)]'
      }`}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="bare"
            aria-label={t('theme.useTheme', { name: theme.name })}
            className="relative block w-full"
          >
            <SceneView scene={scene} mode="thumbnail" />
            {used && (
              <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                {usedBy.map((o) => (
                  <Typography
                    key={o}
                    size={10}
                    weight="bold"
                    caps
                    tone="inherit"
                    className="flex items-center gap-1 rounded-[4px] bg-[var(--accent)] px-1.5 py-0.5 text-[var(--accent-ink)]"
                  >
                    <Check size={10} strokeWidth={3.5} />
                    {t(`theme.outputsShort.${o}`)}
                  </Typography>
                ))}
              </span>
            )}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={4} className={`${MENU_CLASS} w-[250px]`}>
            <DropdownMenu.Label className="px-2 pb-1 pt-1.5">
              <Typography size={11} tone="muted" leading="snug">
                {t('theme.useOn', { kind: kindName })}
              </Typography>
            </DropdownMenu.Label>
            <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => onUse('all')}>
              <span className="w-4 shrink-0">
                {usedBy.length === OUTPUTS.length && <Check size={13} />}
              </span>
              {t('theme.allOutputs')}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-[var(--hairline)]" />
            {OUTPUTS.map((o) => (
              <DropdownMenu.Item key={o} className={ITEM_CLASS} onSelect={() => onUse(o)}>
                <span className="w-4 shrink-0">{usedBy.includes(o) && <Check size={13} />}</span>
                {t(`theme.outputs.${o}`)}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <div className="flex items-center gap-1 px-3 py-2">
        <Typography weight="medium" truncate className="min-w-0">
          {theme.name}
        </Typography>
        {theme.builtIn && <Badge>{t('theme.builtIn')}</Badge>}
        <span className="ml-auto" />
        {theme.builtIn ? (
          // A built-in theme can't change: editing it makes a copy of your own (on Save).
          <Button
            size="xs"
            variant="ghost"
            title={t('theme.editBuiltInHint')}
            onClick={() =>
              openDialog('theme', { editingThemeId: theme.id, editingThemeCopy: true })
            }
          >
            {t('library.edit')}
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
              onClick={() =>
                openDialog('theme', { editingThemeId: theme.id, editingThemeCopy: false })
              }
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
 * Themes, for the whole app. Pick the kind of slide and a layout, then click a theme and say
 * where to use it: every output, or only the main screens, the alternate HDMI output or the
 * stream. The strip above the gallery shows what each output uses now.
 */
export function ThemesPanel() {
  const { t } = useTranslation();
  const themes = useStore((s) => s.themes);
  const defaults = useStore((s) => s.settings?.defaultThemes ?? EMPTY_RECORD) as KindThemes;
  const outputThemes = useStore((s) => s.settings?.outputThemes);
  const [kind, setKind] = useState<ThemeKind>('scripture');
  const [layout, setLayout] = useState<Layout>('full');
  const file = useRef<HTMLInputElement>(null);

  const mainId = defaults[kind] ?? DEFAULT_THEME_IDS[kind];
  /** The theme each output uses for this kind (the others follow the main screens). */
  const inUse: Record<Output, string> = {
    main: mainId,
    alternate: outputThemes?.alternate[kind] ?? mainId,
    stream: outputThemes?.stream[kind] ?? mainId,
  };
  const follows = (o: Output): boolean => o !== 'main' && !outputThemes?.[o][kind];
  const use = (id: string, where: Output | 'all'): void => {
    if (!outputThemes) return;
    if (where === 'all')
      // Everything follows the main screens again, and they take this theme.
      void saveSettings({
        defaultThemes: { ...defaults, [kind]: id },
        outputThemes: {
          alternate: omit(outputThemes.alternate, kind),
          stream: omit(outputThemes.stream, kind),
        },
      });
    else if (where === 'main') {
      // Outputs that were following the main screens keep what they had.
      const keep = (o: 'alternate' | 'stream'): KindThemes =>
        outputThemes[o][kind] ? outputThemes[o] : { ...outputThemes[o], [kind]: mainId };
      void saveSettings({
        defaultThemes: { ...defaults, [kind]: id },
        outputThemes: { alternate: keep('alternate'), stream: keep('stream') },
      });
    } else
      void saveSettings({
        outputThemes: { ...outputThemes, [where]: { ...outputThemes[where], [kind]: id } },
      });
  };
  const followMain = (o: 'alternate' | 'stream'): void => {
    if (outputThemes)
      void saveSettings({ outputThemes: { ...outputThemes, [o]: omit(outputThemes[o], kind) } });
  };

  const shown = useMemo(
    () => themes.filter((th) => (th.layout === 'lower-third') === (layout === 'lowerThird')),
    [themes, layout],
  );
  const builtIn = shown.filter((th) => th.builtIn);
  const mine = shown.filter((th) => !th.builtIn);
  const kindName = t(`theme.kinds.${kind}`).toLowerCase();
  const grid = 'grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3';
  const tile = (th: Theme) => (
    <ThemeTile
      key={th.id}
      theme={th}
      usedBy={OUTPUTS.filter((o) => inUse[o] === th.id)}
      kindName={kindName}
      sample={SAMPLE[kind]}
      onUse={(where) => use(th.id, where)}
    />
  );
  const nameOf = (id: string): string => themes.find((th) => th.id === id)?.name ?? '—';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-[var(--hairline)] px-4 pb-3.5">
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
        {/* What each output uses now for this kind of slide. */}
        <ul aria-label={t('theme.inUse', { kind: kindName })} className="mb-3 flex flex-wrap gap-2">
          {OUTPUTS.map((o) => (
            <li
              key={o}
              data-output={o}
              className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-2)] py-1.5 pl-2.5 pr-1.5 shadow-[var(--shadow-1)]"
            >
              <Typography size={11} tone="muted">
                {t(`theme.outputs.${o}`)}
              </Typography>
              <Typography size={12} weight="semibold" tone="primary">
                {nameOf(inUse[o])}
              </Typography>
              {o !== 'main' &&
                (follows(o) ? (
                  <Typography size={11} tone="muted" className="pr-1">
                    {t('theme.followsMain')}
                  </Typography>
                ) : (
                  <Button size="3xs" variant="ghost" onClick={() => followMain(o)}>
                    {t('theme.followMain')}
                  </Button>
                ))}
            </li>
          ))}
        </ul>
        <Typography as="p" size={12} tone="secondary" leading="snug" className="mb-3 max-w-[76ch]">
          {t('theme.howTo', { kind: kindName })}
        </Typography>

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
