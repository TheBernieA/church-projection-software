import { useState } from 'react';
import { Clock, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId } from '@lampstand/core';
import { Button, Segmented } from '@lampstand/ui';
import { hideOverlay, showOverlay } from '../../lib/actions';
import { cmd } from '../../lib/api';
import { fillMessage, messageTokens } from '../../lib/messages';
import { useOverlayLive, useSettingsList } from '../../lib/hooks';
import { attempt, useStore } from '../../lib/store';
import { AddCard, BIN_CARD, BinRow, CardTitle, FormActions } from '../cards';
import { SoonFeature } from '../Soon';
import { type Message } from '../../types';

type Style = Message['style'];

const overlayId = (m: Message): string => `msg-${m.id}`;

/** One audience message: fill in its fields, then show it as a lower third or ticker. */
function MessageCard({ m, onDelete }: { m: Message; onDelete: () => void }) {
  const { t } = useTranslation();
  const live = useOverlayLive(overlayId(m));
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
      className={`${BIN_CARD} group w-[250px]`}
    >
      <CardTitle
        name={m.name}
        badge={t(`messages.style.${m.style}`)}
        deleteLabel={t('messages.delete', { name: m.name })}
        onDelete={onDelete}
      />
      <p className="line-clamp-2 text-ui-12 leading-snug text-[var(--text-2)]">{text}</p>
      {tokens.map((k) => (
        <input
          key={k}
          className="field !h-7 text-ui-12"
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
      className={`${BIN_CARD} w-[280px]`}
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
      <FormActions
        onCancel={onCancel}
        submitLabel={t('messages.create')}
        disabled={!template.trim()}
      />
    </form>
  );
}

/** Booth → stage message (only the stage display shows it). */
export function StageMessage() {
  const { t } = useTranslation();
  const current = useStore((s) => s.live?.stageMessage);
  const [msg, setMsg] = useState('');
  return (
    <form
      className="flex w-[280px] shrink-0 flex-col gap-2 border-l border-[var(--hairline)] pl-3"
      onSubmit={(e) => {
        e.preventDefault();
        void attempt(() => cmd('stage.message', { text: msg, flash: true }), 'errors.action');
      }}
    >
      <label
        className="flex items-center gap-1.5 text-ui-11 font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
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
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-[var(--accent-soft)] px-2.5 py-1.5 text-ui-12">
          <span className="truncate">“{current.text}”</span>
          <Button
            size="xs"
            variant="ghost"
            type="button"
            onClick={() =>
              void attempt(() => cmd('stage.message', { text: '', flash: false }), 'errors.action')
            }
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
  const [messages, save] = useSettingsList('messages');
  const [adding, setAdding] = useState(false);
  return (
    <BinRow>
      {messages.map((m) => (
        <MessageCard
          key={m.id}
          m={m}
          onDelete={() => {
            void hideOverlay(overlayId(m));
            save(messages.filter((x) => x.id !== m.id));
          }}
        />
      ))}
      {adding ? (
        <NewMessage
          onCancel={() => setAdding(false)}
          onCreate={(m) => {
            save([...messages, m]);
            setAdding(false);
          }}
        />
      ) : (
        <AddCard
          label={t('messages.new')}
          onClick={() => setAdding(true)}
          className="h-[120px] w-[160px]"
        />
      )}
      <SoonFeature id="message-tokens" icon={<Clock size={14} />} className="self-center" />
    </BinRow>
  );
}
