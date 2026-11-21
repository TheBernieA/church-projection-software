import { useEffect, useState } from 'react';
import { ExternalLink, Globe, KeyRound, Plus, Trash2, Eraser, FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CustomBibleApiSchema, type OnlineBible, type OnlineBibleProvider } from '@lampstand/core';
import type { OnlineBibleStatus, QueryResults } from '@lampstand/ipc-contract';
import { Button, Segmented, Typography } from '@lampstand/ui';
import { api, cmd, q } from '../../lib/api';
import { attempt, toast, useStore } from '../../lib/store';
import { ask } from '../../lib/confirm';
import { Select } from '../Select';
import { EMPTY_LIST } from '../../constants';
import { IconTile } from '../kindIcons';
import { Field } from '../form';
import { Group, Notice, Tag } from './parts';

type Draft = Omit<OnlineBible, 'id'>;

/** What each provider starts with, and whether it needs a key. */
const STARTS: Record<OnlineBibleProvider, { draft: Draft; key: boolean; site?: string }> = {
  esv: {
    key: true,
    site: 'https://api.esv.org/account/create-application/',
    draft: {
      provider: 'esv',
      name: 'English Standard Version',
      abbreviation: 'ESV',
      language: 'en',
      direction: 'ltr',
      remoteId: '',
    },
  },
  apibible: {
    key: true,
    site: 'https://api.bible/',
    draft: {
      provider: 'apibible',
      name: '',
      abbreviation: '',
      language: 'en',
      direction: 'ltr',
      remoteId: '',
    },
  },
  bibleapi: {
    key: false,
    site: 'https://bible-api.com/',
    draft: {
      provider: 'bibleapi',
      name: 'World English Bible',
      abbreviation: 'WEB',
      language: 'en',
      direction: 'ltr',
      remoteId: 'web',
    },
  },
  getbible: {
    key: false,
    site: 'https://getbible.net/api',
    draft: {
      provider: 'getbible',
      name: 'King James Version',
      abbreviation: 'KJV',
      language: 'en',
      direction: 'ltr',
      remoteId: 'kjv',
    },
  },
  custom: {
    key: false,
    draft: {
      provider: 'custom',
      name: '',
      abbreviation: '',
      language: 'en',
      direction: 'ltr',
      remoteId: '',
      custom: CustomBibleApiSchema.parse({ urlTemplate: 'https://' }),
    },
  },
};

const PROVIDER_ORDER: OnlineBibleProvider[] = ['esv', 'apibible', 'bibleapi', 'getbible', 'custom'];

/** Settings › Bibles & hymnals › Online Bibles. */
export function OnlineBiblesGroup() {
  const { t } = useTranslation();
  const list = useStore((s) => s.settings?.onlineBibles ?? (EMPTY_LIST as readonly OnlineBible[]));
  const [status, setStatus] = useState<OnlineBibleStatus[]>([]);
  const [adding, setAdding] = useState(false);
  const load = (): void => void q('onlineBible.status').then(setStatus, () => undefined);
  useEffect(() => {
    load();
    // Chapters are saved as they're used anywhere in the app: the counts follow (local, cheap).
    const timer = setInterval(load, 3000);
    const off = api.onRepoChanged((k) => (k === 'bibles' || k === 'settings') && load());
    return () => {
      clearInterval(timer);
      off();
    };
  }, []);

  return (
    <Group
      title={t('onlineBibles.title')}
      description={t('onlineBibles.description')}
      action={
        !adding && (
          <Button
            size="xs"
            variant="ghost"
            icon={<Plus size={13} />}
            onClick={() => setAdding(true)}
          >
            {t('onlineBibles.add')}
          </Button>
        )
      }
    >
      {list.length === 0 && !adding && (
        <Typography as="p" size={13} tone="muted" className="px-4 py-4">
          {t('onlineBibles.empty')}
        </Typography>
      )}
      {list.map((b) => (
        <SourceRow
          key={b.id}
          source={b}
          status={status.find((x) => x.id === b.id)}
          onChanged={load}
        />
      ))}
      {adding && (
        <AddSource
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </Group>
  );
}

/** One online Bible: what it is, how much is saved, its key, clear, remove. */
function SourceRow({
  source,
  status,
  onChanged,
}: {
  source: OnlineBible;
  status: OnlineBibleStatus | undefined;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [keyOpen, setKeyOpen] = useState(false);
  const [key, setKey] = useState('');
  const needsKey = STARTS[source.provider].key || !!source.custom?.keyHeader;
  const saveKey = async (): Promise<void> => {
    const ok = await attempt(() =>
      cmd('onlineBible.update', { id: source.id, key: key.trim() || null }),
    );
    if (ok === undefined) return;
    setKey('');
    setKeyOpen(false);
    toast(t('onlineBibles.keySaved', { name: source.name }));
    onChanged();
  };
  const remove = async (): Promise<void> => {
    const sure = await ask({
      message: t('onlineBibles.confirmRemove', { name: source.name }),
      confirm: t('confirm.remove'),
      tone: 'danger',
    });
    if (sure) void attempt(() => cmd('onlineBible.remove', { id: source.id })).then(onChanged);
  };
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-center gap-3">
        <IconTile icon={Globe} size={36} />
        <Typography leading="tight" className="flex min-w-0 flex-1 flex-col">
          <Typography variant="label" truncate>
            {source.name}
          </Typography>
          <Typography variant="caption" truncate>
            {source.abbreviation} · {t(`onlineBibles.provider.${source.provider}`)}
            {status
              ? ` · ${t('onlineBibles.saved', { n: status.savedVerses, max: status.maxVerses })}`
              : ''}
          </Typography>
        </Typography>
        {needsKey && status && !status.hasKey && <Tag tone="accent">{t('onlineBibles.noKey')}</Tag>}
        {needsKey && (
          <Button
            size="xs"
            variant="ghost"
            icon={<KeyRound size={13} />}
            onClick={() => setKeyOpen((o) => !o)}
          >
            {status?.hasKey ? t('onlineBibles.changeKey') : t('onlineBibles.addKey')}
          </Button>
        )}
        <Button
          size="xs"
          variant="ghost"
          icon={<Eraser size={13} />}
          title={t('onlineBibles.clearHint')}
          onClick={() =>
            void attempt(() => cmd('onlineBible.clearSaved', { id: source.id })).then(onChanged)
          }
        >
          {t('onlineBibles.clear')}
        </Button>
        <Button
          size="xs"
          variant="danger"
          icon={<Trash2 size={13} />}
          onClick={() => void remove()}
        >
          {t('modules.remove')}
        </Button>
      </div>
      {status?.lastError && (
        <Typography as="p" variant="caption" className="text-[var(--tally-program)]">
          {status.lastError}
        </Typography>
      )}
      {keyOpen && (
        <div className="flex items-center gap-2">
          <input
            type="password"
            className="field !h-8 flex-1"
            autoComplete="off"
            aria-label={t('onlineBibles.key')}
            placeholder={t('onlineBibles.keyPlaceholder')}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void saveKey()}
          />
          <Button size="sm" variant="primary" onClick={() => void saveKey()}>
            {t('onlineBibles.saveKey')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Adding one: the provider, its key and version, a try, then Add. */
function AddSource({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(STARTS.esv.draft);
  const [key, setKey] = useState('');
  const [tried, setTried] = useState<QueryResults['onlineBible.probe'] | null>(null);
  const [catalog, setCatalog] = useState<QueryResults['onlineBible.catalog'] | null>(null);
  const [busy, setBusy] = useState(false);
  const start = STARTS[draft.provider];
  const custom = draft.custom ?? CustomBibleApiSchema.parse({ urlTemplate: 'https://' });
  const set = (patch: Partial<Draft>): void => {
    setDraft((d) => ({ ...d, ...patch }));
    setTried(null);
  };
  const setCustom = (patch: Partial<typeof custom>): void =>
    set({ custom: { ...custom, ...patch } });
  const needsKey =
    start.key ||
    (draft.provider === 'custom' && !!custom.keyHeader.trim()) ||
    custom.urlTemplate.includes('{key}');
  const ready =
    draft.name.trim() &&
    draft.abbreviation.trim() &&
    (!start.key || key.trim()) &&
    (draft.provider !== 'apibible' || draft.remoteId);

  const tryIt = async (): Promise<void> => {
    setBusy(true);
    const r = await attempt(() => q('onlineBible.probe', { source: draft, key: key.trim() }));
    setBusy(false);
    if (!r) return;
    setTried(r);
    if (r.copyright && !draft.copyrightLine) set({ copyrightLine: r.copyright });
  };
  const findVersions = async (): Promise<void> => {
    setBusy(true);
    const r = await attempt(() => q('onlineBible.catalog', { key: key.trim() }));
    setBusy(false);
    if (r) setCatalog(r);
  };
  const add = async (): Promise<void> => {
    const id = await attempt(() =>
      cmd<string>('onlineBible.add', { source: draft, key: needsKey ? key.trim() || null : null }),
    );
    if (id === undefined) return;
    toast(t('onlineBibles.added', { name: draft.name }));
    onDone();
  };

  return (
    <div className="flex flex-col gap-3.5 bg-[var(--surface-1)] px-4 py-4">
      <Field label={t('onlineBibles.providerLabel')} group>
        <Segmented
          label={t('onlineBibles.providerLabel')}
          value={draft.provider}
          onChange={(p) => {
            setDraft(STARTS[p].draft);
            setCatalog(null);
            setTried(null);
          }}
          options={PROVIDER_ORDER.map((p) => ({ value: p, label: t(`onlineBibles.short.${p}`) }))}
        />
      </Field>
      <Notice>{t(`onlineBibles.about.${draft.provider}`)}</Notice>
      {start.site && (
        <Button
          size="xs"
          variant="ghost"
          icon={<ExternalLink size={13} />}
          className="self-start"
          onClick={() => window.open(start.site)}
        >
          {start.key ? t('onlineBibles.getKey') : t('onlineBibles.openSite')}
        </Button>
      )}

      {draft.provider === 'custom' && (
        <div className="flex flex-col gap-3">
          <Field
            label={t('onlineBibles.custom.url')}
            htmlFor="ob-url"
            hint={t('onlineBibles.custom.urlHint')}
          >
            <input
              id="ob-url"
              className="field !h-8"
              value={custom.urlTemplate}
              spellCheck={false}
              onChange={(e) => setCustom({ urlTemplate: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t('onlineBibles.custom.header')}
              htmlFor="ob-header"
              hint={t('onlineBibles.custom.headerHint')}
            >
              <input
                id="ob-header"
                className="field !h-8"
                value={custom.keyHeader}
                placeholder="Authorization"
                onChange={(e) => setCustom({ keyHeader: e.target.value })}
              />
            </Field>
            <Field label={t('onlineBibles.custom.prefix')} htmlFor="ob-prefix">
              <input
                id="ob-prefix"
                className="field !h-8"
                value={custom.keyPrefix}
                placeholder="Bearer "
                onChange={(e) => setCustom({ keyPrefix: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t('onlineBibles.custom.format')} group>
            <Segmented
              label={t('onlineBibles.custom.format')}
              value={custom.format}
              onChange={(format) => setCustom({ format })}
              options={[
                { value: 'verses', label: t('onlineBibles.custom.formatVerses') },
                { value: 'text', label: t('onlineBibles.custom.formatText') },
              ]}
            />
          </Field>
          {custom.format === 'verses' ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('onlineBibles.custom.versesPath')} htmlFor="ob-vpath">
                <input
                  id="ob-vpath"
                  className="field !h-8"
                  value={custom.versesPath}
                  onChange={(e) => setCustom({ versesPath: e.target.value })}
                />
              </Field>
              <Field label={t('onlineBibles.custom.textField')} htmlFor="ob-tfield">
                <input
                  id="ob-tfield"
                  className="field !h-8"
                  value={custom.textField}
                  onChange={(e) => setCustom({ textField: e.target.value })}
                />
              </Field>
              <Field label={t('onlineBibles.custom.numberField')} htmlFor="ob-nfield">
                <input
                  id="ob-nfield"
                  className="field !h-8"
                  value={custom.numberField}
                  onChange={(e) => setCustom({ numberField: e.target.value })}
                />
              </Field>
            </div>
          ) : (
            <Field
              label={t('onlineBibles.custom.textPath')}
              htmlFor="ob-tpath"
              hint={t('onlineBibles.custom.textPathHint')}
            >
              <input
                id="ob-tpath"
                className="field !h-8"
                value={custom.textPath}
                onChange={(e) => setCustom({ textPath: e.target.value })}
              />
            </Field>
          )}
        </div>
      )}

      {needsKey && (
        <Field label={t('onlineBibles.key')} htmlFor="ob-key" hint={t('onlineBibles.keyHint')}>
          <div className="flex gap-2">
            <input
              id="ob-key"
              type="password"
              autoComplete="off"
              className="field !h-8 flex-1"
              value={key}
              placeholder={t('onlineBibles.keyPlaceholder')}
              onChange={(e) => {
                setKey(e.target.value);
                setTried(null);
              }}
            />
            {draft.provider === 'apibible' && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!key.trim() || busy}
                onClick={() => void findVersions()}
              >
                {t('onlineBibles.findVersions')}
              </Button>
            )}
          </div>
        </Field>
      )}

      {draft.provider === 'apibible' && catalog && (
        <Field label={t('onlineBibles.version')} htmlFor="ob-version">
          <Select
            id="ob-version"
            size="sm"
            value={draft.remoteId}
            placeholder={
              catalog.length ? t('onlineBibles.pickVersion') : t('onlineBibles.noVersions')
            }
            onChange={(id) => {
              const b = catalog.find((x) => x.id === id);
              if (b)
                set({
                  remoteId: b.id,
                  name: b.name,
                  abbreviation: b.abbreviation,
                  language: b.language,
                  direction: b.direction,
                });
            }}
            options={catalog.map((b) => ({ value: b.id, label: `${b.name} (${b.abbreviation})` }))}
          />
        </Field>
      )}

      {(draft.provider === 'bibleapi' || draft.provider === 'getbible') && (
        <Field
          label={t('onlineBibles.translation')}
          htmlFor="ob-remote"
          hint={t(`onlineBibles.translationHint.${draft.provider}`)}
        >
          <input
            id="ob-remote"
            className="field !h-8 !w-40"
            value={draft.remoteId}
            onChange={(e) => set({ remoteId: e.target.value.trim() })}
          />
        </Field>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_7rem_6rem] gap-3">
        <Field label={t('onlineBibles.name')} htmlFor="ob-name">
          <input
            id="ob-name"
            className="field !h-8"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label={t('onlineBibles.abbreviation')} htmlFor="ob-abbr">
          <input
            id="ob-abbr"
            className="field !h-8"
            maxLength={20}
            value={draft.abbreviation}
            onChange={(e) => set({ abbreviation: e.target.value })}
          />
        </Field>
        <Field label={t('onlineBibles.language')} htmlFor="ob-lang">
          <input
            id="ob-lang"
            className="field !h-8"
            maxLength={35}
            value={draft.language}
            onChange={(e) => set({ language: e.target.value.trim() || 'en' })}
          />
        </Field>
      </div>

      {tried && (
        <Notice>
          {t('onlineBibles.tried')} “{tried.sample}”
        </Notice>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('confirm.cancel')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<FlaskConical size={13} />}
          disabled={
            busy || (start.key && !key.trim()) || (draft.provider === 'apibible' && !draft.remoteId)
          }
          onClick={() => void tryIt()}
        >
          {t('onlineBibles.try')}
        </Button>
        <Button size="sm" variant="primary" disabled={!ready || busy} onClick={() => void add()}>
          {t('onlineBibles.addButton')}
        </Button>
      </div>
    </div>
  );
}
