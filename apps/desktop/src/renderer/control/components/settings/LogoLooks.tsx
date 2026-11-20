import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoStyleSchema, type LogoStyle } from '@lampstand/core';
import { buildLogoCard } from '@lampstand/renderer';
import { CANVAS } from '../../constants';
import { useCanvasScale } from '../../lib/hooks';
import { Tile } from '../cards';

/** One look drawn by the real renderer, scaled down; it moves only while hovered or chosen. */
function LookPreview({ style, text, moving }: { style: LogoStyle; text: string; moving: boolean }) {
  const [host, scale] = useCanvasScale(0.1);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    node.replaceChildren();
    buildLogoCard(document, node, { text, style }, moving);
  }, [style, text, moving]);

  return (
    <div ref={host} className="absolute inset-0">
      <div
        ref={stage}
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: CANVAS.width, height: CANVAS.height, transform: `scale(${scale})` }}
      />
    </div>
  );
}

/** Settings → Logo: pick the name card's look from live previews. */
export function LogoLooks({
  value,
  text,
  onChange,
}: {
  value: LogoStyle;
  text: string;
  onChange: (style: LogoStyle) => void;
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<LogoStyle | null>(null);
  return (
    <div
      role="radiogroup"
      aria-label={t('settings.logo.look')}
      className="grid w-full grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5"
    >
      {LogoStyleSchema.options.map((style) => {
        const on = style === value;
        return (
          <Tile
            key={style}
            role="radio"
            aria-checked={on}
            aria-label={t(`settings.logo.looks.${style}`)}
            selected={on}
            label={t(`settings.logo.looks.${style}`)}
            onClick={() => onChange(style)}
            onPointerEnter={() => setHover(style)}
            onPointerLeave={() => setHover(null)}
          >
            <LookPreview style={style} text={text || 'Lampstand'} moving={hover === style} />
          </Tile>
        );
      })}
    </div>
  );
}
