import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  makeScene,
  newId,
  type Look,
  type ScreenMask,
  type Settings,
  LookLayerSchema,
} from '@lampstand/core';
import { Button, IconButton, Segmented, Slider, Typography } from '@lampstand/ui';
import { BUILT_IN_BACKGROUNDS } from '../../constants';
import { usePictures } from '../../lib/hooks';
import { useStore } from '../../lib/store';
import { DeferredInput } from '../DeferredControls';
import { SceneView } from '../SceneView';
import { Select } from '../Select';
import { Group, LayerChips, NameRow, Row, SettingsPage } from './parts';

type Update = (patch: Partial<Settings>) => void;
type Shape = ScreenMask['shape'];
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** A mask's edge or corner amount: a slider with its value. */
function Amount({
  label,
  value,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = (): void => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <label className="flex items-center gap-3">
      <Typography size={12} tone="secondary" className="w-16 shrink-0">
        {label}
      </Typography>
      <Slider
        aria-label={label}
        min={0}
        max={max}
        step={1}
        value={shown}
        format={(v) => `${v}%`}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="flex-1"
      />
    </label>
  );
}

/** Sample picture for the mask preview: a bright background with a line of text. */
const SAMPLE = makeScene({
  background: BUILT_IN_BACKGROUNDS[0] ? { ref: BUILT_IN_BACKGROUNDS[0].ref } : null,
});

/**
 * One mask: its name, shape (box with rounded corners, oval, or a picture), how far in each
 * edge comes, and a live preview of an output with it applied.
 */
function MaskEditor({
  mask,
  onChange,
  onDelete,
}: {
  mask: ScreenMask;
  onChange: (patch: Partial<ScreenMask>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const pictures = usePictures();
  return (
    <div className="flex gap-4 px-4 py-4">
      <div className="w-[220px] shrink-0">
        <div className="overflow-hidden rounded-[4px] bg-black shadow-[0_0_0_1px_var(--hairline-strong)]">
          <SceneView scene={SAMPLE} label={t('masks.preview', { name: mask.name })} mask={mask} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <DeferredInput
            aria-label={t('masks.name')}
            value={mask.name}
            maxLength={40}
            onCommit={(name) => name.trim() && onChange({ name: name.trim() })}
            className="field !h-8 flex-1"
          />
          <IconButton
            size="xs"
            variant="danger"
            aria-label={t('masks.delete', { name: mask.name })}
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
        <Segmented<Shape>
          label={t('masks.shape')}
          value={mask.shape}
          onChange={(shape) => onChange({ shape })}
          options={[
            { value: 'rect', label: t('masks.rect') },
            { value: 'ellipse', label: t('masks.ellipse') },
            { value: 'image', label: t('masks.image') },
          ]}
        />
        {mask.shape === 'image' ? (
          <>
            <Select<string>
              size="sm"
              aria-label={t('masks.picture')}
              placeholder={t('masks.pickPicture')}
              value={mask.mediaId ?? ''}
              onChange={(mediaId) => onChange({ mediaId })}
              options={pictures.map((m) => ({ value: m.id, label: m.name }))}
            />
            <Typography as="p" variant="caption" leading="snug">
              {t('masks.imageHelp')}
            </Typography>
          </>
        ) : (
          <>
            {SIDES.map((side) => (
              <Amount
                key={side}
                label={t(`masks.${side}`)}
                value={mask[side]}
                max={45}
                onCommit={(v) => onChange({ [side]: v })}
              />
            ))}
            {mask.shape === 'rect' && (
              <Amount
                label={t('masks.radius')}
                value={mask.radius}
                max={50}
                onCommit={(radius) => onChange({ radius })}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Looks: named combinations of which layers the audience and secondary screens show. Switched
 * from the toolbar's Looks button.
 */
function LooksGroup({ s, update }: { s: Settings; update: Update }) {
  const { t } = useTranslation();
  const looks = s.looks;
  const save = (next: Look[]): void => update({ looks: next });
  const edit = (id: string, patch: Partial<Look>): void =>
    save(looks.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  return (
    <Group title={t('looks.title')} footnote={t('looks.help')}>
      {looks.map((l) => (
        <div key={l.id} className="flex flex-col gap-2.5 px-4 py-3.5">
          <NameRow
            value={l.name}
            label={t('looks.name')}
            deleteLabel={t('looks.delete', { name: l.name })}
            onRename={(name) => edit(l.id, { name })}
            onDelete={() => save(looks.filter((x) => x.id !== l.id))}
          />
          {(['main', 'secondary'] as const).map((screen) => (
            <div key={screen} className="flex items-center gap-3">
              <Typography size={12} tone="secondary" className="w-20 shrink-0">
                {t(`looks.screens.${screen}`)}
              </Typography>
              <LayerChips
                label={t('looks.layersOn', { screen: t(`looks.screens.${screen}`), name: l.name })}
                value={l[screen]}
                onChange={(layers) => edit(l.id, { [screen]: layers })}
                names={(layer) => t(`looks.layers.${layer}`)}
              />
            </div>
          ))}
        </div>
      ))}
      <div className="px-4 py-3">
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus size={14} />}
          disabled={looks.length >= 20}
          onClick={() =>
            save([
              ...looks,
              {
                id: newId(),
                name: t('looks.newName', { n: looks.length + 1 }),
                main: [...LookLayerSchema.options],
                secondary: ['background'],
              },
            ])
          }
        >
          {t('looks.add')}
        </Button>
      </div>
    </Group>
  );
}

/**
 * Settings › Screens: screen masks (shape or hide parts of an output, e.g. for a creative stage
 * or a screen partly behind a pillar), and which mask each kind of screen uses.
 */
export function ScreensPage({ s, update }: { s: Settings; update: Update }) {
  const { t } = useTranslation();
  const masks = s.screenMasks;
  const save = (next: ScreenMask[]): void => {
    // A deleted mask stops being used.
    const ids = new Set(next.map((m) => m.id));
    const maskFor = {
      main: s.maskFor.main && ids.has(s.maskFor.main) ? s.maskFor.main : null,
      secondary: s.maskFor.secondary && ids.has(s.maskFor.secondary) ? s.maskFor.secondary : null,
    };
    update({ screenMasks: next, maskFor });
  };
  const roles = ['main', 'secondary'] as const;
  const options = [
    { value: 'none', label: t('masks.none') },
    ...masks.map((m) => ({ value: m.id, label: m.name })),
  ];
  const outputs = useStore((x) => x.displays.length);
  return (
    <SettingsPage title={t('settings.pages.screens')} description={t('settings.pagesHelp.screens')}>
      <Group title={t('masks.use')} footnote={outputs ? undefined : t('masks.noOutputs')}>
        {roles.map((role) => (
          <Row key={role} label={t(`masks.role.${role}`)} description={t(`masks.roleHelp.${role}`)}>
            <div className="w-48">
              <Select<string>
                size="sm"
                aria-label={t(`masks.role.${role}`)}
                value={s.maskFor[role] ?? 'none'}
                onChange={(v) =>
                  update({ maskFor: { ...s.maskFor, [role]: v === 'none' ? null : v } })
                }
                options={options}
              />
            </div>
          </Row>
        ))}
      </Group>
      <LooksGroup s={s} update={update} />
      <Group title={t('masks.title')} footnote={t('masks.help')}>
        {masks.map((m) => (
          <MaskEditor
            key={m.id}
            mask={m}
            onChange={(patch) => save(masks.map((x) => (x.id === m.id ? { ...x, ...patch } : x)))}
            onDelete={() => save(masks.filter((x) => x.id !== m.id))}
          />
        ))}
        <div className="px-4 py-3">
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus size={14} />}
            disabled={masks.length >= 20}
            onClick={() =>
              save([
                ...masks,
                {
                  id: newId(),
                  name: t('masks.newName', { n: masks.length + 1 }),
                  shape: 'rect',
                  top: 5,
                  right: 5,
                  bottom: 5,
                  left: 5,
                  radius: 4,
                },
              ])
            }
          >
            {t('masks.add')}
          </Button>
        </div>
      </Group>
    </SettingsPage>
  );
}
