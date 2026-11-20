import { useEffect, useRef, type ButtonHTMLAttributes } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Pipette, Plus, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Typography } from '@lampstand/ui';
import { saveSettings } from '../lib/actions';
import { useStore } from '../lib/store';
import { EMPTY_LIST } from '../constants';
import { MENU_CLASS, MENU_LABEL_CLASS, SEPARATOR_CLASS } from './menu';

const HEX = /^#[0-9a-f]{6}$/i;

/** The palette: a row of greys, a row of strong colours, then their tints and shades. */
const PALETTE: string[][] = [
  [
    '#000000',
    '#434343',
    '#666666',
    '#999999',
    '#b7b7b7',
    '#cccccc',
    '#d9d9d9',
    '#efefef',
    '#f3f3f3',
    '#ffffff',
  ],
  [
    '#980000',
    '#ff0000',
    '#ff9900',
    '#ffff00',
    '#00ff00',
    '#00ffff',
    '#4a86e8',
    '#0000ff',
    '#9900ff',
    '#ff00ff',
  ],
  [
    '#e6b8af',
    '#f4cccc',
    '#fce5cd',
    '#fff2cc',
    '#d9ead3',
    '#d0e0e3',
    '#c9daf8',
    '#cfe2f3',
    '#d9d2e9',
    '#ead1dc',
  ],
  [
    '#dd7e6b',
    '#ea9999',
    '#f9cb9c',
    '#ffe599',
    '#b6d7a8',
    '#a2c4c9',
    '#a4c2f4',
    '#9fc5e8',
    '#b4a7d6',
    '#d5a6bd',
  ],
  [
    '#cc4125',
    '#e06666',
    '#f6b26b',
    '#ffd966',
    '#93c47d',
    '#76a5af',
    '#6d9eeb',
    '#6fa8dc',
    '#8e7cc3',
    '#c27ba0',
  ],
  [
    '#a61c00',
    '#cc0000',
    '#e69138',
    '#f1c232',
    '#6aa84f',
    '#45818e',
    '#3c78d8',
    '#3d85c6',
    '#674ea7',
    '#a64d79',
  ],
  [
    '#85200c',
    '#990000',
    '#b45f06',
    '#bf9000',
    '#38761d',
    '#134f5c',
    '#1155cc',
    '#0b5394',
    '#351c75',
    '#741b47',
  ],
  [
    '#5b0f00',
    '#660000',
    '#783f04',
    '#7f6000',
    '#274e13',
    '#0c343d',
    '#1c4587',
    '#073763',
    '#20124d',
    '#4c1130',
  ],
];

/** Chromium's screen colour picker (not in every engine, so looked for first). */
interface EyeDropperApi {
  open: () => Promise<{ sRGBHex: string }>;
}
const eyeDropper = (): (new () => EyeDropperApi) | undefined =>
  (window as Window & { EyeDropper?: new () => EyeDropperApi }).EyeDropper;

/** Light colours get a dark tick and outline; dark ones a light tick. */
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return r * 0.299 + g * 0.587 + b * 0.114 > 186;
}

/** One round swatch in the palette (a menu item: arrows move between them, Enter picks). */
function Swatch({ hex, on, onPick }: { hex: string; on: boolean; onPick: () => void }) {
  const light = isLight(hex);
  return (
    <DropdownMenu.Item
      aria-label={hex}
      title={hex}
      onSelect={onPick}
      className={`flex size-[22px] cursor-pointer items-center justify-center rounded-full outline-none transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:shadow-[0_0_0_2px_var(--accent)] data-[highlighted]:scale-110 ${
        light ? 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]' : ''
      }`}
      style={{ background: hex }}
    >
      {on && <Check size={13} strokeWidth={3} color={light ? '#000' : '#fff'} />}
    </DropdownMenu.Item>
  );
}

const SMALL_ITEM =
  'flex size-[22px] cursor-pointer items-center justify-center rounded-full text-[var(--text-2)] outline-none hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] data-[highlighted]:bg-[var(--surface-3)] data-[highlighted]:text-[var(--text-1)]';

/**
 * A colour: a swatch showing it, opening a palette to pick from (presets, the operator's own
 * custom colours, a colour from anywhere on the screen, or any colour from the system picker).
 * `onReset` adds "Reset" (back to what the theme says). The system picker reports every step
 * of a drag through `onChange`, like the old native input; a palette pick is one change.
 */
export function ColorInput({
  value,
  onChange,
  onReset,
  fallback = '#ffffff',
  variant = 'field',
  className = '',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (hex: string) => void;
  onReset?: () => void;
  fallback?: string;
  variant?: 'field' | 'swatch';
}) {
  const { t } = useTranslation();
  const custom = useStore((s) => s.settings?.customColors ?? (EMPTY_LIST as string[]));
  const native = useRef<HTMLInputElement>(null);
  const hex = (
    HEX.test(value) ? value : HEX.test(value.slice(0, 7)) ? value.slice(0, 7) : fallback
  ).toLowerCase();
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  /** Keep a colour among the custom ones (newest first, no repeats, at most 20). */
  const keep = (c: string): void => {
    const next = [c.toLowerCase(), ...custom.filter((x) => x.toLowerCase() !== c.toLowerCase())];
    void saveSettings({ customColors: next.slice(0, 20) });
  };
  // The system picker: every step shows (React's onChange is the input event); its own
  // "change" (the picker closed on a colour) also saves it as a custom colour.
  useEffect(() => {
    const el = native.current;
    if (!el) return;
    const done = (): void => keep(el.value);
    el.addEventListener('change', done);
    return () => el.removeEventListener('change', done);
  });

  const Dropper = eyeDropper();
  const fromScreen = (): void => {
    if (!Dropper) return;
    new Dropper()
      .open()
      .then(({ sRGBHex }) => {
        const c = sRGBHex.slice(0, 7).toLowerCase();
        if (!HEX.test(c)) return;
        latest.current(c);
        keep(c);
      })
      .catch(() => undefined); // the operator pressed Esc
  };

  const size = variant === 'swatch' ? 'h-6 w-8' : 'h-8 w-11';
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          {/* The colour itself, inset in a field-like frame, so it always reads as a colour. */}
          <Button
            variant="bare"
            title={rest['aria-label']}
            {...rest}
            className={`group inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-2)] p-[3px] shadow-[inset_0_0_0_1px_var(--hairline-strong)] hover:shadow-[inset_0_0_0_1px_var(--text-3)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-default disabled:opacity-40 ${size} ${className}`}
          >
            <span
              aria-hidden
              className="block size-full rounded-[calc(var(--radius-control)-3px)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]"
              style={{ background: hex }}
            />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className={`${MENU_CLASS} w-[272px] !p-3`}
          >
            {onReset && (
              <>
                <DropdownMenu.Item
                  onSelect={onReset}
                  className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1.5 outline-none hover:bg-[var(--surface-3)] data-[highlighted]:bg-[var(--surface-3)]"
                >
                  <RotateCcw size={14} />
                  <Typography size={13}>{t('color.reset')}</Typography>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className={`${SEPARATOR_CLASS} !my-2`} />
              </>
            )}
            <div
              role="group"
              aria-label={t('color.palette')}
              className="grid grid-cols-10 gap-[3px]"
            >
              {PALETTE.flat().map((c) => (
                <Swatch key={c} hex={c} on={c === hex} onPick={() => onChange(c)} />
              ))}
            </div>
            <DropdownMenu.Separator className={`${SEPARATOR_CLASS} !my-2.5`} />
            <DropdownMenu.Label className={`${MENU_LABEL_CLASS} !px-0 !pt-0`}>
              {t('color.custom')}
            </DropdownMenu.Label>
            <div role="group" aria-label={t('color.custom')} className="flex flex-wrap gap-[3px]">
              {custom.map((c) => (
                <Swatch
                  key={c}
                  hex={c.toLowerCase()}
                  on={c.toLowerCase() === hex}
                  onPick={() => onChange(c.toLowerCase())}
                />
              ))}
              <DropdownMenu.Item
                aria-label={t('color.add')}
                title={t('color.add')}
                className={SMALL_ITEM}
                // The system picker opens once the menu has closed (it needs the focus).
                onSelect={() => setTimeout(() => native.current?.click(), 0)}
              >
                <Plus size={16} />
              </DropdownMenu.Item>
              {Dropper && (
                <DropdownMenu.Item
                  aria-label={t('color.fromScreen')}
                  title={t('color.fromScreen')}
                  className={SMALL_ITEM}
                  onSelect={() => setTimeout(fromScreen, 0)}
                >
                  <Pipette size={14} />
                </DropdownMenu.Item>
              )}
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {/* Any colour at all: the system picker (hidden; opened by "+"). */}
      <input
        ref={native}
        type="color"
        tabIndex={-1}
        aria-hidden
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none fixed size-0 opacity-0"
      />
    </>
  );
}
