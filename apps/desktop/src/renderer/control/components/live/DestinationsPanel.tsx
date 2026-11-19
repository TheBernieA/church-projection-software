import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StreamDestination, StreamSettings } from '@lampstand/core';
import type { StreamStatus } from '@lampstand/ipc-contract';
import { Button, IconButton, Switch, Typography } from '@lampstand/ui';
import { saveSettings } from '../../lib/actions';
import { openDialog, useStore } from '../../lib/store';
import { useDestinations } from '../../lib/streamDestinations';
import { DeferredInput } from '../DeferredControls';
import { ITEM_CLASS, MENU_CLASS } from '../menu';
import { run, Section } from './consoleParts';
import { DESTINATION_KINDS, DestinationFields, parseDirect } from './destinationFields';

/** One choice in the Add menu: its name and what it is for. */
function AddItem({ name, help, onSelect }: { name: string; help: string; onSelect: () => void }) {
  return (
    <DropdownMenu.Item
      aria-label={name}
      className={`${ITEM_CLASS} !h-auto flex-col !items-start gap-0.5 py-1.5`}
      onSelect={onSelect}
    >
      <Typography size={13} tone="primary">
        {name}
      </Typography>
      <Typography size={11} tone="muted" leading="snug">
        {help}
      </Typography>
    </DropdownMenu.Item>
  );
}

/**
 * Where the stream goes: each destination with its health and on/off; opening one shows just
 * what it needs (a stream key, a server address, a receiver's address). NDI, which is set up on
 * its own page, has a row here too so every way out is in one list.
 */
export function DestinationsPanel({ s, st }: { s: StreamStatus | null; st: StreamSettings }) {
  const { t } = useTranslation();
  const live = !!s?.streaming;
  const failed = live && s.destinations.some((d) => d.state === 'failed');
  const [open, setOpen] = useState<string | null>(null);
  const {
    keys,
    loadKeys,
    patch,
    add: addKind,
    remove,
  } = useDestinations(
    st.destinations,
    (destinations) => void saveSettings({ stream: { ...st, destinations } }),
  );
  const ndi = useStore((x) => x.ndi);
  const ndiFeeds = useStore((x) => x.settings?.ndi.feeds.filter((f) => f.enabled).length ?? 0);
  // Straight to what a new one needs.
  const add = (kind: StreamDestination['kind']): void => setOpen(addKind(kind));
  const openNdi = (): void => openDialog('settings', { settingsPage: 'ndi' });
  const dot = (id: string): string => {
    const state = s?.destinations.find((d) => d.id === id)?.state;
    return state === 'ok'
      ? 'var(--tally-preview)'
      : state === 'failed'
        ? 'var(--tally-program)'
        : state === 'connecting'
          ? 'var(--accent)'
          : 'var(--text-3)';
  };
  /** What a destination still needs before it can go live (null: it's set). */
  const missing = (d: StreamDestination): string | null => {
    if (d.kind === 'direct') {
      const a = parseDirect(d.url);
      return a.host && a.port ? null : t('console.addressNeeded');
    }
    if (d.kind === 'custom') return d.url.trim() ? null : t('console.addressNeeded');
    return keys[d.id] ? null : t('console.keyNeeded');
  };
  return (
    <Section
      title={t('console.destinations')}
      action={
        <div className="flex items-center gap-1">
          {failed && (
            <Button
              size="2xs"
              variant="secondary"
              icon={<RotateCcw size={12} />}
              onClick={() => run('stream.retry')}
            >
              {t('console.retry')}
            </Button>
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button size="2xs" variant="ghost" icon={<Plus size={12} />} disabled={live}>
                {t('console.addDestination')}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className={`${MENU_CLASS} w-[280px]`}
              >
                {DESTINATION_KINDS.map((k) => (
                  <AddItem
                    key={k}
                    name={t(`streaming.kinds.${k}`)}
                    help={t(`console.kindHelp.${k}`)}
                    onSelect={() => add(k)}
                  />
                ))}
                <AddItem
                  name={t('console.ndi')}
                  help={t('console.kindHelp.ndi')}
                  onSelect={openNdi}
                />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      }
    >
      {st.destinations.length === 0 && (
        <Typography as="p" size={12} tone="muted" leading="snug">
          {t('console.noDestinations')}
        </Typography>
      )}
      <ul className="flex flex-col gap-1">
        {st.destinations.map((d) => {
          const going = s?.destinations.find((x) => x.id === d.id);
          const state = going?.state;
          const reason = going?.reason;
          const needs = missing(d);
          const expanded = open === d.id;
          return (
            <li
              key={d.id}
              className={`rounded-[8px] transition-colors ${expanded ? 'bg-[var(--surface-2)] shadow-[0_0_0_1px_var(--hairline)]' : ''}`}
            >
              <div className="flex h-9 items-center gap-2 pl-2 pr-1.5">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: dot(d.id) }}
                />
                <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <Typography size={13} tone="primary" truncate>
                    {d.name}
                  </Typography>
                  {d.name !== t(`streaming.kinds.${d.kind}`) && (
                    <Typography size={11} tone="muted" className="shrink-0">
                      {t(`streaming.kinds.${d.kind}`)}
                    </Typography>
                  )}
                </div>
                {state ? (
                  <Typography size={11} tone="muted" title={reason} className="shrink-0">
                    {t(`live.dest.${state}`)}
                  </Typography>
                ) : (
                  needs && (
                    <Typography
                      size={10}
                      weight="semibold"
                      tone="inherit"
                      caps
                      className="shrink-0 rounded-[4px] bg-[var(--accent-soft)] px-1.5 py-px text-[var(--accent)]"
                    >
                      {needs}
                    </Typography>
                  )
                )}
                <Switch
                  label={t('streaming.enabledOf', { name: d.name })}
                  checked={d.enabled}
                  disabled={live}
                  onChange={(enabled) => patch(d.id, { enabled })}
                />
                <IconButton
                  size="xs"
                  aria-label={t('console.editDestination', { name: d.name })}
                  aria-expanded={expanded}
                  disabled={live}
                  onClick={() => setOpen(expanded ? null : d.id)}
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </IconButton>
              </div>
              {state === 'failed' && reason && (
                <Typography
                  as="p"
                  size={11}
                  tone="inherit"
                  leading="snug"
                  className="break-words px-2 pb-1.5 pl-[26px] text-[var(--tally-program)]"
                >
                  {reason}
                </Typography>
              )}
              {expanded && (
                <div className="flex flex-col gap-2.5 border-t border-[var(--hairline)] px-2.5 pb-2.5 pt-2.5">
                  <DestinationFields
                    dest={d}
                    hasKey={!!keys[d.id]}
                    srt={s?.srt ?? null}
                    onChange={(p) => patch(d.id, p)}
                    onKeySaved={() => {
                      loadKeys();
                      setOpen(null);
                    }}
                  />
                  <div className="flex items-center gap-2 border-t border-[var(--hairline)] pt-2.5">
                    <Typography size={11} tone="muted" className="shrink-0">
                      {t('streaming.destName')}
                    </Typography>
                    <DeferredInput
                      aria-label={t('streaming.destName')}
                      value={d.name}
                      maxLength={60}
                      onCommit={(name) => name.trim() && patch(d.id, { name: name.trim() })}
                      className="field !h-7 min-w-0 flex-1"
                    />
                    <Button
                      size="2xs"
                      variant="danger"
                      icon={<Trash2 size={12} />}
                      aria-label={t('streaming.remove', { name: d.name })}
                      onClick={() => void remove(d)}
                    >
                      {t('console.remove')}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {/* NDI: sent whenever its feeds are on (no Go live needed); set up on its own page. */}
        <li className="flex h-9 items-center gap-2 pl-2 pr-1.5">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              background: ndi?.available && ndiFeeds > 0 ? 'var(--tally-preview)' : 'var(--text-3)',
            }}
          />
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <Typography size={13} tone="primary">
              {t('console.ndi')}
            </Typography>
            <Typography size={11} tone="muted" truncate>
              {!ndi?.available
                ? t('console.ndiNeedsTools')
                : ndiFeeds > 0
                  ? t('console.ndiOn', { count: ndiFeeds })
                  : t('console.ndiOff')}
            </Typography>
          </div>
          <Button size="2xs" variant="ghost" onClick={openNdi}>
            {t('console.ndiSetUp')}
          </Button>
        </li>
      </ul>
    </Section>
  );
}
