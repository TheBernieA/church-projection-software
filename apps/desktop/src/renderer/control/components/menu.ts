import { typographyClass } from '@lampstand/ui';

/** Dropdown menu panel (Radix DropdownMenu.Content / SubContent). */
export const MENU_CLASS =
  'z-[60] min-w-[220px] rounded-[8px] bg-[var(--surface-2)] p-1 shadow-[var(--shadow-3)] outline-none focus-visible:!shadow-[var(--shadow-3)] data-[state=open]:animate-[ls-pop_120ms_ease-out]';

/** One menu entry: blue while highlighted, dimmed when disabled. */
export const ITEM_CLASS = `flex cursor-pointer items-center gap-2.5 rounded-[5px] px-2.5 py-1.5 outline-none data-[disabled]:cursor-default data-[disabled]:text-[var(--text-3)] data-[highlighted]:bg-[var(--select)] data-[highlighted]:text-white ${typographyClass({ size: 13 })}`;

/** Thin line between groups of menu entries. */
export const SEPARATOR_CLASS = 'mx-1 my-1 h-px bg-[var(--hairline-strong)]';

/** A small all-caps heading inside a menu. */
export const MENU_LABEL_CLASS = `px-2.5 pb-1 pt-1.5 ${typographyClass({ size: 11, tone: 'muted', weight: 'semibold', caps: true })}`;
