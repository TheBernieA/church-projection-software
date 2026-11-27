import { create } from 'zustand';
import {
  newId,
  nowIso,
  SERVICE_SCHEMA_VERSION,
  type ServiceItem,
  type ServicePlan,
} from '@lampstand/core';
import { resolveDraft, type PlanDraft, type ResolvedPlan } from '@lampstand/planner';
import { cmd, q } from './api';
import { attempt, editService, flushServiceSave, openService, toast, useStore } from './store';
import i18n from '../i18n';

/**
 * The online assistant, as the control window sees it (ADR 0008): whether a key is saved (never
 * the key), and the planner's steps. Every request goes through main.
 */

interface AssistantState {
  /** null until asked. */
  hasKey: boolean | null;
}

export const useAssistant = create<AssistantState>(() => ({ hasKey: null }));

export async function refreshAssistant(): Promise<void> {
  try {
    const { hasKey } = await q('assistant.status');
    useAssistant.setState({ hasKey });
  } catch {
    useAssistant.setState({ hasKey: false });
  }
}

/** Check a key with Anthropic, then keep it in the keychain. Throws with a readable reason. */
export async function saveAssistantKey(key: string): Promise<void> {
  await q('assistant.setKey', { key });
  useAssistant.setState({ hasKey: true });
}

export async function forgetAssistantKey(): Promise<void> {
  await q('assistant.forgetKey');
  useAssistant.setState({ hasKey: false });
}

/** Ask for a plan, and turn the answer into plan items checked against this library. */
export async function planService(
  text: string,
  opts: { date?: string; useLibrary: boolean },
): Promise<ResolvedPlan> {
  const draft: PlanDraft = await q('assistant.plan', {
    text,
    useLibrary: opts.useLibrary,
    ...(opts.date ? { date: opts.date } : {}),
  });
  const s = useStore.getState();
  return resolveDraft(draft, {
    songs: s.songs,
    versionId: s.settings?.defaultBibleVersion ?? 'kjv',
    newId,
  });
}

/** A new playlist from a reviewed plan, opened. */
export async function createPlannedService(
  name: string,
  date: string | null,
  items: ServiceItem[],
): Promise<boolean> {
  await flushServiceSave();
  const now = nowIso();
  const plan: ServicePlan = {
    id: newId(),
    schemaVersion: SERVICE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    name: name.trim().slice(0, 200) || i18n.t('services.newName'),
    date: date ?? now.slice(0, 10),
    isTemplate: false,
    items,
  };
  const ok = await attempt(async () => {
    await cmd('service.save', { entity: plan });
    await openService(plan.id);
    return true;
  });
  if (ok) {
    useStore.setState({ sidebarView: 'playlist' });
    toast(i18n.t('planner.created', { name: plan.name }));
  }
  return !!ok;
}

/** Add a reviewed plan's items to the end of the open playlist (one undoable step). */
export function addToOpenService(items: ServiceItem[]): boolean {
  const service = useStore.getState().service;
  if (!service) return false;
  editService((s) => ({ ...s, items: [...s.items, ...items].slice(0, 1000) }));
  toast(i18n.t('planner.added', { count: items.length, name: service.name }));
  return true;
}
