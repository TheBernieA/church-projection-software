import { useEffect, useState } from 'react';
import {
  BookOpen,
  Download,
  HardDriveDownload,
  ListMusic,
  PackagePlus,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EMPTY_MASKS, EMPTY_SCENE, type Scene, type Settings, type Standby } from '@lampstand/core';
import type { AppInfo, ModuleSummary } from '@lampstand/ipc-contract';
import { Button, Segmented, Switch } from '@lampstand/ui';
import { api, cmd, q } from '../../lib/api';
import { usePictures, useStandby } from '../../lib/hooks';
import { attempt, toast, useStore } from '../../lib/store';
import { CommitSlider, DeferredInput } from '../DeferredControls';
import { SceneView } from '../SceneView';
import { Select } from '../Select';
import { IconTile } from '../kindIcons';
import { Group, Row, SettingsPage, ThemeTiles, UnitInput } from './parts';

type Update = (patch: Partial<Settings>) => void;
interface PageProps {
  s: Settings;
  update: Update;
}

export function GeneralPage({ s, update }: PageProps) {
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('settings.pages.general')} description={t('settings.pagesHelp.general')}>
      <Group title={t('settings.appearance')}>
        <Row label={t('settings.uiTheme')} description={t('settings.uiThemeHelp')} stack>
          <ThemeTiles
            value={s.uiTheme}
            onChange={(uiTheme) => update({ uiTheme })}
            labels={{ dark: t('settings.dark'), light: t('settings.light') }}
          />
        </Row>
        <Row
          label={t('settings.uiScale')}
          description={t('settings.uiScaleHelp')}
          htmlFor="ui-scale"
        >
          <CommitSlider
            id="ui-scale"
            min={0.9}
            max={1.5}
            step={0.05}
            value={s.uiScale}
            onCommit={(uiScale) => update({ uiScale })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Row>
      </Group>
    </SettingsPage>
  );
}

export function ScripturePage({ s, update }: PageProps) {
  const { t } = useTranslation();
  const versions = useStore((x) => x.versions);
  return (
    <SettingsPage
      title={t('settings.pages.scripture')}
      description={t('settings.pagesHelp.scripture')}
    >
      <Group>
        <Row
          label={t('settings.defaultVersion')}
          description={t('settings.defaultVersionHelp')}
          htmlFor="default-version"
        >
          <div className="w-56">
            <Select
              id="default-version"
              size="sm"
              value={s.defaultBibleVersion}
              onChange={(defaultBibleVersion) => update({ defaultBibleVersion })}
              options={versions.map((v) => ({
                value: v.id,
                label: `${v.abbreviation} — ${v.name}`,
              }))}
            />
          </div>
        </Row>
      </Group>
      <Group title={t('settings.slides')} footnote={t('settings.slidesFootnote')}>
        <Row label={t('settings.versesPerSlide')} description={t('settings.versesPerSlideHelp')}>
          <Segmented
            label={t('settings.versesPerSlide')}
            value={s.scripture.versesPerSlide}
            onChange={(versesPerSlide) => update({ scripture: { ...s.scripture, versesPerSlide } })}
            options={[
              { value: 'one', label: t('settings.one') },
              { value: 'fit', label: t('settings.fit') },
            ]}
          />
        </Row>
        <Row
          label={t('settings.maxChars')}
          description={t('settings.maxCharsHelp')}
          htmlFor="max-chars"
        >
          <UnitInput
            id="max-chars"
            min={60}
            max={1200}
            step={20}
            unit={t('settings.characters')}
            value={String(s.scripture.maxCharsPerSlide)}
            onCommit={(v) =>
              update({
                scripture: {
                  ...s.scripture,
                  maxCharsPerSlide: Math.min(1200, Math.max(60, Number(v) || 320)),
                },
              })
            }
          />
        </Row>
      </Group>
    </SettingsPage>
  );
}

export function SongsPage({ s, update }: PageProps) {
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('settings.pages.songs')} description={t('settings.pagesHelp.songs')}>
      <Group>
        <Row
          label={t('settings.maxLines')}
          description={t('settings.maxLinesHelp')}
          htmlFor="max-lines"
        >
          <UnitInput
            id="max-lines"
            min={1}
            max={12}
            unit={t('settings.lines')}
            value={String(s.lyrics.maxLinesPerSlide)}
            onCommit={(v) =>
              update({ lyrics: { maxLinesPerSlide: Math.min(12, Math.max(1, Number(v) || 4)) } })
            }
          />
        </Row>
      </Group>
      <Group title={t('settings.licensing')}>
        <Row label={t('settings.ccli')} description={t('settings.ccliHelp')} htmlFor="ccli">
          <UnitInput
            id="ccli"
            type="text"
            wide
            placeholder="e.g. 1234567"
            value={s.ccliLicenseNumber ?? ''}
            onCommit={(v) => update({ ccliLicenseNumber: v.trim() || undefined })}
          />
        </Row>
      </Group>
    </SettingsPage>
  );
}

const LIVE_KINDS = ['song', 'scripture', 'presentation', 'announcements'] as const;

type OffAirKind = Settings['offAir']['kind'];
type LogoKind = Settings['logo']['kind'];

/** "Picture" row: pick an image or video from the library (shared by Logo and Off-air). */
function PictureRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (mediaId: string) => void;
}) {
  const { t } = useTranslation();
  const pictures = usePictures();
  return (
    <Row label={t('settings.picture.label')} description={t('settings.picture.help')}>
      {pictures.length ? (
        <Select
          aria-label={label}
          className="w-56"
          value={value ?? ''}
          placeholder={t('settings.picture.pick')}
          onChange={onChange}
          options={pictures.map((m) => ({
            value: m.id,
            label: m.name,
            description: t(`settings.picture.kind.${m.kind}`),
          }))}
        />
      ) : (
        <span className="text-[12px] text-[var(--text-3)]">{t('settings.picture.none')}</span>
      )}
    </Row>
  );
}

/** A small live preview of a screen, drawn by the same renderer as the projector. */
function PreviewRow({
  testId,
  scene,
  standby,
}: {
  testId: string;
  scene: Scene;
  standby?: Standby;
}) {
  const { t } = useTranslation();
  return (
    <Row label={t('settings.preview')} stack>
      <div
        className="w-72 overflow-hidden rounded-[6px] shadow-[0_0_0_1px_var(--hairline-strong)]"
        data-testid={testId}
      >
        <SceneView scene={scene} standby={standby ?? null} label={t('settings.preview')} />
      </div>
    </Row>
  );
}

/** Keep the current pick if it still exists, otherwise default to the first picture. */
function keepOrFirst(current: string | undefined, pictures: { id: string }[]): string | undefined {
  return current && pictures.some((m) => m.id === current) ? current : pictures[0]?.id;
}

const LOGO_SCENE: Scene = { ...EMPTY_SCENE, masks: { ...EMPTY_MASKS, logo: true } };

/** The church logo: a name card, or an image/video. Shown by Logo (L) and as the off-air screen. */
function LogoGroup({ s, update }: PageProps) {
  const { t } = useTranslation();
  const pictures = usePictures();
  const set = (patch: Partial<Settings['logo']>): void => update({ logo: { ...s.logo, ...patch } });
  return (
    <Group title={t('settings.logo.title')} footnote={t('settings.logo.footnote')}>
      <Row label={t('settings.logo.show')} description={t('settings.logo.showHelp')}>
        <Segmented<LogoKind>
          label={t('settings.logo.show')}
          value={s.logo.kind}
          onChange={(kind) =>
            set({
              kind,
              mediaId: kind === 'media' ? keepOrFirst(s.logo.mediaId, pictures) : s.logo.mediaId,
            })
          }
          options={[
            { value: 'text', label: t('settings.logo.text') },
            { value: 'media', label: t('settings.logo.media') },
          ]}
        />
      </Row>
      {s.logo.kind === 'text' ? (
        <Row
          label={t('settings.logo.name')}
          description={t('settings.logo.nameHelp')}
          htmlFor="logo-name"
        >
          <DeferredInput
            id="logo-name"
            className="field !h-8 !w-56"
            maxLength={80}
            value={s.logo.text}
            onCommit={(text) => set({ text })}
          />
        </Row>
      ) : (
        <PictureRow
          label={t('settings.logo.picture')}
          value={s.logo.mediaId}
          onChange={(mediaId) => set({ mediaId })}
        />
      )}
      <PreviewRow testId="logo-preview" scene={LOGO_SCENE} />
    </Group>
  );
}

/** What the projector shows when nothing is live (after "Turn off live", before the service). */
function OffAirGroup({ s, update }: PageProps) {
  const { t } = useTranslation();
  const pictures = usePictures();
  const standby = useStandby();
  return (
    <Group title={t('settings.offAir.title')} footnote={t('settings.offAir.footnote')}>
      <Row label={t('settings.offAir.show')} description={t('settings.offAir.showHelp')}>
        <Segmented<OffAirKind>
          label={t('settings.offAir.show')}
          value={s.offAir.kind}
          onChange={(kind) =>
            update({ offAir: { kind, mediaId: keepOrFirst(s.offAir.mediaId, pictures) } })
          }
          options={[
            { value: 'black', label: t('settings.offAir.black') },
            { value: 'logo', label: t('settings.offAir.logo') },
            { value: 'media', label: t('settings.offAir.media') },
          ]}
        />
      </Row>
      {s.offAir.kind === 'media' && (
        <PictureRow
          label={t('settings.offAir.picture')}
          value={s.offAir.mediaId}
          onChange={(mediaId) => update({ offAir: { kind: 'media', mediaId } })}
        />
      )}
      <PreviewRow testId="off-air-preview" scene={EMPTY_SCENE} standby={standby} />
    </Group>
  );
}

export function PresentingPage({ s, update }: PageProps) {
  const { t } = useTranslation();
  return (
    <SettingsPage
      title={t('settings.pages.presenting')}
      description={t('settings.pagesHelp.presenting')}
    >
      <LogoGroup s={s} update={update} />
      <OffAirGroup s={s} update={update} />
      <Group title={t('settings.liveEditing')} footnote={t('settings.liveEditingHelp')}>
        {LIVE_KINDS.map((k) => (
          <Row key={k} label={t(`service.kind.${k}`)} description={t(`settings.liveKindHelp.${k}`)}>
            <Switch
              label={t(`service.kind.${k}`)}
              checked={s.liveEditingKinds.includes(k)}
              onChange={(on) =>
                update({
                  liveEditingKinds: on
                    ? [...s.liveEditingKinds, k]
                    : s.liveEditingKinds.filter((x) => x !== k),
                })
              }
            />
          </Row>
        ))}
      </Group>
    </SettingsPage>
  );
}

export function PackagesPage() {
  const { t } = useTranslation();
  const [mods, setMods] = useState<ModuleSummary[]>([]);
  const load = (): void => void q('modules.list').then(setMods, () => undefined);
  useEffect(() => {
    load();
    return api.onRepoChanged((k) => (k === 'bibles' || k === 'songs') && load());
  }, []);
  const install = async (): Promise<void> => {
    const r = await attempt(() => q('modules.install'), 'errors.install');
    if (!r) return;
    for (const m of r.installed) toast(t('modules.installed', { name: m.name }));
    for (const f of r.failed) toast(`${f.file}: ${f.message}`, 'error');
    load();
  };
  const remove = (m: ModuleSummary): void => {
    if (!window.confirm(t('modules.confirmRemove', { name: m.name }))) return;
    void attempt(() => cmd('module.remove', { kind: m.kind, id: m.id })).then(load);
  };
  const groups = (['bible', 'hymnal'] as const).map((kind) => ({
    kind,
    items: mods.filter((m) => m.kind === kind),
  }));

  return (
    <SettingsPage
      title={t('settings.pages.packages')}
      description={t('modules.help')}
      action={
        <Button
          size="sm"
          variant="primary"
          icon={<PackagePlus size={15} />}
          onClick={() => void install()}
        >
          {t('modules.install')}
        </Button>
      }
    >
      {groups.map(({ kind, items }) => (
        <Group key={kind} title={t(`modules.groups.${kind}`)}>
          {items.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-[var(--text-3)]">
              {t(`modules.empty.${kind}`)}
            </p>
          ) : (
            items.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <IconTile icon={kind === 'bible' ? BookOpen : ListMusic} size={36} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium">{m.name}</span>
                  <span className="truncate text-[12px] text-[var(--text-3)]">{m.detail}</span>
                </span>
                <span className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-2)]">
                  {t(`modules.source.${m.source}`)}
                </span>
                {m.removable && (
                  <Button
                    size="xs"
                    variant="danger"
                    icon={<Trash2 size={13} />}
                    onClick={() => remove(m)}
                  >
                    {t('modules.remove')}
                  </Button>
                )}
              </div>
            ))
          )}
        </Group>
      ))}
    </SettingsPage>
  );
}

export function LibraryPage() {
  const { t } = useTranslation();
  const run = async (fn: () => Promise<string | null>): Promise<void> => {
    const msg = await attempt(fn);
    if (msg) toast(msg);
  };
  return (
    <SettingsPage title={t('settings.pages.library')} description={t('settings.pagesHelp.library')}>
      <Group title={t('settings.backups')} footnote={t('settings.backupsFootnote')}>
        <Row label={t('settings.backup')} description={t('settings.backupHelp')}>
          <Button
            size="sm"
            variant="subtle"
            icon={<HardDriveDownload size={15} />}
            onClick={() =>
              void run(async () =>
                (await q('library.backupNow')).done ? t('settings.backedUp') : null,
              )
            }
          >
            {t('settings.backupAction')}
          </Button>
        </Row>
      </Group>
      <Group title={t('settings.moveLibrary')}>
        <Row label={t('settings.export')} description={t('settings.exportHelp')}>
          <Button
            size="sm"
            variant="subtle"
            icon={<Upload size={15} />}
            onClick={() =>
              void run(async () =>
                (await q('library.export')).done ? t('settings.exported') : null,
              )
            }
          >
            {t('settings.exportAction')}
          </Button>
        </Row>
        <Row label={t('settings.import')} description={t('settings.importHelp')}>
          <Button
            size="sm"
            variant="subtle"
            icon={<Download size={15} />}
            onClick={() =>
              void run(async () => {
                const r = await q('library.import');
                return r.done ? t('settings.importedN', { count: r.imported }) : null;
              })
            }
          >
            {t('settings.importAction')}
          </Button>
        </Row>
      </Group>
    </SettingsPage>
  );
}

export function AboutPage() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void q('app.info').then(setInfo, () => undefined);
  }, []);
  return (
    <SettingsPage title={t('settings.pages.about')} description={t('settings.pagesHelp.about')}>
      <div className="flex gap-3 rounded-[var(--radius-card)] bg-[var(--surface-2)] p-4 shadow-[var(--shadow-1)]">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">{t('settings.privacyTitle')}</p>
          <p className="text-[12px] leading-relaxed text-[var(--text-2)]">
            {t('settings.privacyText')}
          </p>
        </div>
      </div>
      <Group title={t('settings.version')}>
        <Row label="Lampstand">
          <span className="tnum text-[13px] text-[var(--text-2)]">
            {info ? `${info.version} · Electron ${info.electron} · ${info.platform}` : '…'}
          </span>
        </Row>
      </Group>
    </SettingsPage>
  );
}
