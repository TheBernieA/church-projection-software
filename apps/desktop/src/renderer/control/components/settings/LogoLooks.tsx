import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoStyleSchema, type LogoStyle } from '@lampstand/core';
import { buildLogoCard } from '@lampstand/renderer';
import { CANVAS } from '../../constants';

/** One look drawn by the real renderer, scaled down; it moves only while hovered or chosen. */
function LookPreview({ style, text, moving }: { style: LogoStyle; text: string; moving: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.1);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / CANVAS.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    node.replaceChildren();
    buildLogoCard(document, node, { text, style }, moving);
  }, [style, text, moving]);

  return (
    <div ref={host} className="relative aspect-video w-full overflow-hidden bg-black">
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
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={t(`settings.logo.looks.${style}`)}
            onClick={() => onChange(style)}
            onPointerEnter={() => setHover(style)}
            onPointerLeave={() => setHover(null)}
            className={`overflow-hidden rounded-[6px] text-left transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
              on
                ? 'shadow-[0_0_0_2px_var(--accent)]'
                : 'shadow-[0_0_0_1px_var(--hairline-strong)] hover:shadow-[0_0_0_1px_var(--text-3)]'
            }`}
          >
            <LookPreview style={style} text={text || 'Lampstand'} moving={hover === style} />
            <span className="block bg-[var(--surface-2)] px-2 py-1.5 text-[12px] font-medium">
              {t(`settings.logo.looks.${style}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
