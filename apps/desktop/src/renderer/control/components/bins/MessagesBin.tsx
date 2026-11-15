import { useState } from 'react';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, type Settings } from '@lampstand/core';
import { Button, IconButton, Segmented } from '@lampstand/ui';
import { hideOverlay, saveSettings, showOverlay } from '../../lib/actions';
import { cmd } from '../../lib/api';
import { fillMessage, messageTokens } from '../../lib/messages';
import { useStore } from '../../lib/store';

type Message = Settings['messages'][number];
type Style = Message['style'];

const overlayId = (m: Message): string => `msg-${m.id}`;

/** One audience message: fill in its fields, then show it as a lower third or ticker. */
function MessageCard({ m, live, onDelete }: { m: Message; live: boolean; onDelete: () => void }) {
  const { t } = useTranslation();
  const tokens = messageTokens(m.template);
  const [values, setValues] = useState<Record<string, string>>({});
  const text = fillMessage(m.template, values);
  const missing = tokens.some((k) => !values[k]?.trim());
  return (
    <form
      aria-label={m.name}
      onSubmit={(e) => {
        e.preventDefault();
        void (live
          ? hideOverlay(overlayId(m))
          : showOverlay({ id: overlayId(m), kind: m.style, text }));
      }}
      style={live ? { boxShadow: 'var(--tally-program-glow)' } : undefined}
      className="group flex w-[250px] shrink-0 flex-col gap-2 rounded-[6px] bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-1)]"
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{m.name}</span>
        <span className="rounded-[4px] bg-[var(--surface-3)] px-1.5 text-[10px] font-medium text-[var(--text-3)]">
          {t(`messages.style.${m.style}`)}
        </span>
        <IconButton
          size="xs"
          type="button"
          aria-label={t('messages.delete', { name: m.name })}
          className="opacity-0 group-hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </IconButton>
      </div>
      <p className="line-clamp-2 text-[12px] leading-snug text-[var(--text-2)]">{text}</p>
      {tokens.map((k) => (
        <input
          key={k}
          className="field !h-7 text-[12px]"
          aria-label={k}
          placeholder={k}
          value={values[k] ?? ''}
          disabled={live}
          onChange={(e) => setValues({ ...values, [k]: e.target.value })}
        />
      ))}
      <Button
        size="xs"
        type="submit"
        variant={live ? 'live' : 'secondary'}
        disabled={!live && missing}
      >
        {live ? t('monitor.hide') : t('monitor.show')}
      </Button>
    </form>
  );
}

function NewMessage({
  onCreate,
  onCancel,
}: {
  onCreate: (m: Message) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const [style, setStyle] = useState<Style>('lower-third');
  return (
    <form
      aria-label={t('messages.new')}
      className="flex w-[280px] shrink-0 flex-col gap-2 rounded-[6px] bg-[var(--surface-2)] p-2.5 shadow-[var(--shadow-1)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!template.trim()) return;
        onCreate({
          id: newId(),
          name: name.trim() || template.trim().slice(0, 40),
          template: template.trim(),
          style,
        });
      }}
    >
      <input
        className="field !h-8"
        aria-label={t('messages.name')}
        placeholder={t('messages.name')}
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        className="field !h-8"
        aria-label={t('messages.template')}
        placeholder={t('messages.templatePlaceholder')}
        value={template}
        maxLength={300}
        onChange={(e) => setTemplate(e.target.value)}
      />
      <Segmented<Style>
        label={t('messages.styleLabel')}
        value={style}
        onChange={setStyle}
        options={[
          { value: 'lower-third', label: t('messages.style.lower-third') },
          { value: 'ticker', label: t('messages.style.ticker') },
        ]}
      />
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" type="button" onClick={onCancel}>
          {t('song.cancel')}
        </Button>
        <Button size="xs" variant="primary" type="submit" disabled={!template.trim()}>
          {t('messages.create')}
        </Button>
      </div>
    </form>
  );
}

/** Booth → stage message (only the stage display shows it). */
function StageMessage() {
  const { t } = useTranslation();
  const current = useStore((s) => s.live?.stageMessage);
  const [msg, setMsg] = useState('');
  return (
    <form
      className="flex w-[280px] shrink-0 flex-col gap-2 border-l border-[var(--hairline)] pl-3"
      onSubmit={(e) => {
        e.preventDefault();
        void cmd('stage.message', { text: msg, flash: true });
      }}
    >
      <label
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
        htmlFor="stage-msg"
      >
        <MessageSquare size={13} /> {t('monitor.stageMessage')}
      </label>
      <div className="flex gap-1.5">
        <input
          id="stage-msg"
          className="field !h-8"
          value={msg}
          maxLength={300}
          onChange={(e) => setMsg(e.target.value)}
          placeholder={t('messages.stagePlaceholder')}
        />
        <Button size="sm" type="submit" variant="primary" disabled={!msg.trim()}>
          {t('monitor.send')}
        </Button>
      </div>
      {current && (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-[var(--accent-soft)] px-2.5 py-1.5 text-[12px]">
          <span className="truncate">“{current.text}”</span>
          <Button
            size="xs"
            variant="ghost"
            type="button"
            onClick={() => void cmd('stage.message', { text: '', flash: false })}
          >
            {t('monitor.clearMessage')}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Messages bin: audience messages with fill-in fields, plus the stage message. */
export function MessagesBin() {
  const { t } = useTranslation();
  const messages = useStore((s) => s.settings?.messages);
  const overlays = useStore((s) => s.live?.program.overlays);
  const [adding, setAdding] = useState(false);
  const list = messages ?? [];
  const save = (next: Message[]): void => void saveSettings({ messages: next });
  return (
    <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-3">
      {list.map((m) => {
        const live = !!overlays?.some((o) => o.id === overlayId(m));
        return (
          <MessageCard
            key={m.id}
            m={m}
            live={live}
            onDelete={() => {
              if (live) void hideOverlay(overlayId(m));
              save(list.filter((x) => x.id !== m.id));
            }}
          />
        );
      })}
      {adding ? (
        <NewMessage
          onCancel={() => setAdding(false)}
          onCreate={(m) => {
            save([...list, m]);
            setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-[120px] w-[160px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[6px] border-2 border-dashed border-[var(--hairline-strong)] text-[12px] font-medium text-[var(--text-3)] transition-colors hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
        >
          <Plus size={18} />
          {t('messages.new')}
        </button>
      )}
      <div className="ml-auto flex">
        <StageMessage />
      </div>
    </div>
  );
}
