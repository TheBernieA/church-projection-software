import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type Theme } from '@lampstand/core';
import { themeFor } from '../../lib/slides';
import { useStore } from '../../lib/store';
import { SceneView } from '../SceneView';
import { Select, type SelectOption } from '../Select';
import { sampleScene } from '../ThemesPanel';

/** The "follow the Themes page" choice (a song with no theme of its own). */
const DEFAULT = 'default';

function Thumb({ theme }: { theme: Theme }) {
  return (
    <span aria-hidden className="w-12 shrink-0 overflow-hidden rounded-[4px]">
      <SceneView scene={sampleScene(theme, 'Aa')} mode="thumbnail" />
    </span>
  );
}

/**
 * A song's theme, picked by its picture: one of the full-screen themes, or the default (whatever
 * the Themes page uses for lyrics, so changing that changes this song too).
 */
export function ThemePicker({
  value,
  onChange,
  id,
}: {
  value: string | null;
  onChange: (themeId: string | null) => void;
  id?: string;
}) {
  const { t } = useTranslation();
  const themes = useStore((s) => s.themes);
  const settings = useStore((s) => s.settings);
  const options = useMemo((): SelectOption<string>[] => {
    const fallback = themeFor({ themes, settings }, 'lyrics');
    return [
      {
        value: DEFAULT,
        label: t('song.themeDefault'),
        description: fallback.name,
        leading: <Thumb theme={fallback} />,
      },
      ...themes
        .filter((th) => th.layout !== 'lower-third')
        .map((th) => ({ value: th.id, label: th.name, leading: <Thumb theme={th} /> })),
    ];
  }, [themes, settings, t]);
  return (
    <Select
      id={id}
      value={value && options.some((o) => o.value === value) ? value : DEFAULT}
      onChange={(v) => onChange(v === DEFAULT ? null : v)}
      options={options}
    />
  );
}
