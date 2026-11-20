import { useState, type ReactNode } from 'react';
import { Copy, FolderPlus, Palette, Plus, Scissors, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { newId, omit, type Song } from '@lampstand/core';
import {
  arrangementLabel,
  GROUP_LABELS,
  nextGroupLabel,
  parseArrangementOrder,
  parseSongText,
  renameGroup,
  songSectionsToText,
} from '@lampstand/lyrics';
import { Button, IconButton, Segmented, Switch, Typography } from '@lampstand/ui';
import { copySong, deleteSong } from '../../lib/songs';
import { themeFor } from '../../lib/slides';
import { openDialog, useStore } from '../../lib/store';
import { InspectorShell, useFocusDraft } from '../canvas/editorParts';
import { Field } from '../form';
import { ThemePicker } from './ThemePicker';
import { type SongEditorState } from './useSongEditor';

type Tab = 'song' | 'slide';

/** A labelled block of the inspector. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-[var(--hairline)] px-4 py-4 last:border-b-0">
      <Typography as="h3" variant="overline">
        {title}
      </Typography>
      {children}
    </section>
  );
}

/**
 * A text box that saves as you type. While it has the caret it shows what was typed; otherwise
 * what's stored (so undo shows), tidied by `commit` however it likes.
 */
function DraftInput({
  id,
  label,
  value,
  commit,
  placeholder,
  maxLength,
  list,
}: {
  id: string;
  label: string;
  value: string;
  commit: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  list?: string;
}) {
  const draft = useFocusDraft(value);
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        className="field"
        value={draft.value}
        placeholder={placeholder}
        maxLength={maxLength}
        list={list}
        onFocus={draft.onFocus}
        onBlur={draft.onBlur}
        onChange={(e) => {
          draft.set(e.target.value);
          commit(e.target.value);
        }}
      />
    </Field>
  );
}

/** The song's details: title, credits, theme, arrangements and translation. */
function SongTab({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  const { song } = ed;
  const themes = useStore((s) => s.themes);
  const settings = useStore((s) => s.settings);
  const theme = themeFor({ themes, settings }, 'lyrics', song.themeId);
  const optional = (key: 'copyright' | 'ccliNumber' | 'key') => (v: string) =>
    ed.patch((s) => (v.trim() ? { ...s, [key]: v.trim() } : omit(s, key)), true);
  return (
    <>
      <Section title={t('songEditor.details')}>
        <DraftInput
          id="song-title"
          label={t('song.title')}
          value={song.title}
          maxLength={200}
          commit={(v) => ed.patch({ title: v.trim() || t('song.untitled') }, true)}
        />
        <DraftInput
          id="song-authors"
          label={t('song.authors')}
          value={song.authors.join(', ')}
          commit={(v) =>
            ed.patch(
              {
                authors: v
                  .split(',')
                  .map((a) => a.trim())
                  .filter(Boolean)
                  .slice(0, 20),
              },
              true,
            )
          }
        />
        <DraftInput
          id="song-copyright"
          label={t('song.copyright')}
          value={song.copyright ?? ''}
          placeholder={t('songEditor.copyrightPlaceholder')}
          maxLength={500}
          commit={optional('copyright')}
        />
        <div className="grid grid-cols-2 gap-3">
          <DraftInput
            id="song-ccli"
            label={t('song.ccli')}
            value={song.ccliNumber ?? ''}
            maxLength={20}
            commit={optional('ccliNumber')}
          />
          <DraftInput
            id="song-key"
            label={t('songEditor.key')}
            value={song.key ?? ''}
            maxLength={10}
            commit={optional('key')}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Typography variant="label">{t('songEditor.showCredits')}</Typography>
          <Switch
            label={t('songEditor.showCredits')}
            checked={song.showCredits !== false}
            onChange={(on) =>
              ed.patch((s) => (on ? omit(s, 'showCredits') : { ...s, showCredits: false }))
            }
          />
        </div>
        <Typography as="p" variant="caption" leading="snug">
          {t('songEditor.creditsHint')}
        </Typography>
      </Section>
      <Section title={t('song.theme')}>
        <ThemePicker
          value={song.themeId ?? null}
          onChange={(id) => ed.patch((s) => (id ? { ...s, themeId: id } : omit(s, 'themeId')))}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={<Palette size={14} />}
          onClick={() =>
            openDialog('theme', { editingThemeId: theme.id, editingThemeCopy: !!theme.builtIn })
          }
        >
          {t('songEditor.editTheme', { name: theme.name })}
        </Button>
        <Typography as="p" variant="caption" leading="snug">
          {t('songEditor.themeHint')}
        </Typography>
      </Section>
      <Section title={t('song.arrangements')}>
        <Arrangements ed={ed} />
      </Section>
      <Section title={t('song.translationSection')}>
        <Translation ed={ed} />
      </Section>
      <div className="px-4 py-4">
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 size={14} />}
          onClick={() => void deleteSong(song)}
        >
          {t('song.delete')}
        </Button>
      </div>
    </>
  );
}

/** One arrangement: default or not, its name, and its order typed as "V1 C V2 C". */
function ArrangementRow({
  ed,
  id,
  name,
  order,
}: {
  ed: SongEditorState;
  id: string;
  name: string;
  order: string[];
}) {
  const { t } = useTranslation();
  const { song } = ed;
  const label = arrangementLabel(order, song.sections);
  const nameDraft = useFocusDraft(name);
  const orderDraft = useFocusDraft(label);
  const edit = (p: Partial<Song['arrangements'][number]>): void =>
    void ed.patch(
      (s) => ({
        ...s,
        arrangements: s.arrangements.map((a) => (a.id === id ? { ...a, ...p } : a)),
      }),
      true,
    );
  return (
    <li className="flex items-center gap-1.5">
      <input
        type="radio"
        name="default-arrangement"
        aria-label={t('song.defaultArrangement', { name })}
        title={t('song.defaultArrangementHint')}
        checked={song.defaultArrangementId === id}
        onChange={() => ed.patch({ defaultArrangementId: id })}
      />
      <input
        className="field !h-8 !w-24"
        aria-label={t('song.arrangementName')}
        value={nameDraft.value}
        maxLength={60}
        onFocus={nameDraft.onFocus}
        onBlur={nameDraft.onBlur}
        onChange={(e) => {
          nameDraft.set(e.target.value);
          edit({ name: e.target.value.trim() || t('song.arrangementName') });
        }}
      />
      <input
        className="field !h-8 min-w-0 flex-1"
        aria-label={t('song.arrangementOrder', { name })}
        value={orderDraft.value}
        placeholder="V1 C V2 C"
        onFocus={orderDraft.onFocus}
        onBlur={orderDraft.onBlur}
        onChange={(e) => {
          orderDraft.set(e.target.value);
          edit({ sectionOrder: parseArrangementOrder(e.target.value, song.sections) });
        }}
      />
      <IconButton
        size="xs"
        variant="ghost"
        disabled={song.arrangements.length <= 1}
        aria-label={t('song.removeArrangement', { name })}
        onClick={() =>
          ed.patch((s) => {
            const arrangements = s.arrangements.filter((a) => a.id !== id);
            const keep = arrangements.some((a) => a.id === s.defaultArrangementId);
            return {
              ...s,
              arrangements,
              defaultArrangementId: keep ? s.defaultArrangementId : (arrangements[0]?.id ?? id),
            };
          })
        }
      >
        <Trash2 size={13} />
      </IconButton>
    </li>
  );
}

/** The song's arrangements (orders of its groups); an empty order plays every group in turn. */
function Arrangements({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  const { song } = ed;
  return (
    <>
      <ul className="space-y-1.5">
        {song.arrangements.map((a) => (
          <ArrangementRow key={a.id} ed={ed} id={a.id} name={a.name} order={a.sectionOrder} />
        ))}
      </ul>
      <Button
        size="xs"
        variant="ghost"
        icon={<Plus size={13} />}
        disabled={song.arrangements.length >= 20}
        onClick={() =>
          ed.patch((s) => ({
            ...s,
            arrangements: [
              ...s.arrangements,
              {
                id: newId(),
                name: t('song.newArrangementName', { n: s.arrangements.length + 1 }),
                sectionOrder: [],
              },
            ],
          }))
        }
      >
        {t('song.addArrangement')}
      </Button>
      <Typography as="p" variant="caption" leading="snug">
        {t('song.arrangementHelp')}
      </Typography>
    </>
  );
}

/**
 * One translation: its language, and its words under the same [Group] headings as the song's
 * groups (each part shows under the slide of the group with that name).
 */
function Translation({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  const { song } = ed;
  const lang = Object.keys(song.translations ?? {})[0] ?? '';
  const words = lang ? songSectionsToText(song.translations?.[lang] ?? []) : '';
  const langDraft = useFocusDraft(lang);
  const wordsDraft = useFocusDraft(words);
  const setTranslation = (code: string, text: string): void =>
    void ed.patch(
      (s) => ({ ...s, translations: { [code]: parseSongText(text, s.sections).sections } }),
      true,
    );
  return (
    <>
      <Field label={t('song.translationLang')} htmlFor="song-tlang">
        <input
          id="song-tlang"
          className="field !h-8 !w-28"
          value={langDraft.value}
          maxLength={35}
          placeholder="es"
          onFocus={langDraft.onFocus}
          onBlur={langDraft.onBlur}
          onChange={(e) => {
            langDraft.set(e.target.value);
            // Kept under its new code once there is one (a cleared box keeps the old).
            if (e.target.value.trim()) setTranslation(e.target.value.trim(), words);
          }}
        />
      </Field>
      <Field label={t('song.translation')} htmlFor="song-trans">
        <textarea
          id="song-trans"
          className="field"
          rows={6}
          disabled={!lang}
          value={wordsDraft.value}
          placeholder={lang ? '[Verse 1]\n…' : t('songEditor.translationFirst')}
          onFocus={wordsDraft.onFocus}
          onBlur={wordsDraft.onBlur}
          onChange={(e) => {
            wordsDraft.set(e.target.value);
            setTranslation(lang, e.target.value);
          }}
          spellCheck
        />
      </Field>
      <Typography as="p" variant="caption" leading="snug">
        {t('song.translationHelp')}
      </Typography>
      {lang && (
        <Button
          size="xs"
          variant="ghost"
          icon={<Trash2 size={13} />}
          onClick={() => ed.patch((s) => omit(s, 'translations'))}
        >
          {t('songEditor.removeTranslation')}
        </Button>
      )}
    </>
  );
}

/** The slide's group and words, and what can be done with it. */
function SlideTab({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  const { current, at } = ed;
  const section = ed.song.sections.find((s) => s.id === current?.sectionId);
  const text = current?.lines.join('\n') ?? '';
  const words = useFocusDraft(text);
  if (ed.pending || !current || !section)
    return (
      <Section title={t('songEditor.slide')}>
        <Typography as="p" variant="caption" leading="snug">
          {t('songEditor.typeNew')}
        </Typography>
      </Section>
    );
  const long = current.lines.length > ed.maxLines;
  return (
    <>
      <Section title={t('songEditor.slideN', { n: at + 1 })}>
        <DraftInput
          id="song-group"
          label={t('songEditor.groupName')}
          value={section.label}
          maxLength={60}
          list="song-group-names"
          commit={(v) => void ed.patch((s) => renameGroup(s, section.id, v), true)}
        />
        <datalist id="song-group-names">
          {GROUP_LABELS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        {!ed.startsGroup(at) && (
          <Button
            size="xs"
            variant="ghost"
            icon={<FolderPlus size={13} />}
            onClick={() => ed.group(at, nextGroupLabel(ed.song))}
          >
            {t('songEditor.groupFromHere')}
          </Button>
        )}
        <Field label={t('songEditor.words')} htmlFor="song-slide-words">
          <textarea
            id="song-slide-words"
            className="field"
            rows={6}
            value={words.value}
            onFocus={words.onFocus}
            onBlur={(e) => {
              words.onBlur();
              // A slide emptied here goes when you leave the box (as when typing on the slide).
              ed.stopTyping(e.target.value);
            }}
            onChange={(e) => {
              words.set(e.target.value);
              ed.type(e.target.value);
            }}
            spellCheck
          />
        </Field>
        {long && (
          <div className="flex items-center gap-2 rounded-[6px] bg-[var(--surface-2)] p-2">
            <Typography as="p" variant="caption" leading="snug" className="flex-1">
              {t('songEditor.longHint', { max: ed.maxLines })}
            </Typography>
            <Button size="xs" icon={<Scissors size={13} />} onClick={() => ed.splitLong(at)}>
              {t('songEditor.split')}
            </Button>
          </div>
        )}
      </Section>
      <div className="flex flex-wrap gap-1.5 px-4 py-4">
        <Button size="xs" variant="ghost" icon={<Plus size={13} />} onClick={() => ed.newSlide()}>
          {t('canvas.newSlide')}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          icon={<Copy size={13} />}
          onClick={() => ed.duplicate(at)}
        >
          {t('canvas.duplicate')}
        </Button>
        <Button size="xs" variant="ghost" icon={<Trash2 size={13} />} onClick={() => ed.remove(at)}>
          {t('canvas.deleteSlide')}
        </Button>
      </div>
    </>
  );
}

/**
 * The song editor's inspector: the song (its details, look, arrangements and translation) and
 * the slide being edited. A hymn can't change here: it offers a copy of your own instead.
 */
export function SongInspector({ ed }: { ed: SongEditorState }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('song');
  return (
    <InspectorShell label={t('songEditor.inspector')}>
      <div className="px-4 pt-3">
        <Segmented<Tab>
          label={t('songEditor.inspector')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'song', label: t('songEditor.songTab') },
            { value: 'slide', label: t('songEditor.slideTab') },
          ]}
        />
      </div>
      {ed.readOnly ? (
        <div className="space-y-3 px-4 py-4">
          <Typography as="p" size={12} className="rounded bg-[var(--accent-soft)] p-2">
            {t('song.readOnly')}
          </Typography>
          <Button variant="primary" onClick={() => void copySong(ed.song)}>
            {t('song.duplicate')}
          </Button>
        </div>
      ) : tab === 'song' ? (
        <SongTab ed={ed} />
      ) : (
        <SlideTab ed={ed} />
      )}
    </InspectorShell>
  );
}
