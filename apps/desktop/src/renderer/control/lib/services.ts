import { newId, nowIso, SERVICE_SCHEMA_VERSION, type ServicePlan } from '@lampstand/core';
import { cmd, q } from './api';
import { attempt, flushServiceSave, openService, toast, useStore } from './store';
import i18n from '../i18n';
import { ask } from './confirm';

/** A template's name without its " (template)" ending. */
const withoutSuffix = (name: string, suffix: string): string =>
  name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;

/**
 * Create a service (playlist): empty, or a copy of `from`. `asTemplate` saves it as a reusable
 * template instead of opening it.
 */
export async function createService(from?: ServicePlan, asTemplate = false): Promise<void> {
  await flushServiceSave();
  const now = nowIso();
  const plan: ServicePlan = {
    id: newId(),
    schemaVersion: SERVICE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    name: from
      ? asTemplate
        ? `${from.name}${i18n.t('services.templateSuffix')}`
        : withoutSuffix(from.name, i18n.t('services.templateSuffix'))
      : i18n.t('services.newName'),
    date: now.slice(0, 10),
    isTemplate: asTemplate,
    items: from ? from.items.map((i) => ({ ...i, id: newId() })) : [],
  };
  await attempt(async () => {
    await cmd('service.save', { entity: plan });
    if (!asTemplate) await openService(plan.id);
    else toast(i18n.t('service.templateSaved'));
  });
}

/**
 * Delete a playlist (Undo brings it back). If it was the open one, another opens in its place,
 * or the plan is left empty.
 */
export async function deleteService(id: string, name: string): Promise<void> {
  const ok = await ask({
    message: i18n.t('sidebar.confirmDelete', { name }),
    confirm: i18n.t('confirm.delete'),
    tone: 'danger',
  });
  if (!ok) return;
  // Anything still unsaved goes first, so a late save can't bring the playlist back.
  await flushServiceSave();
  const state = useStore.getState();
  if (state.service?.id === id) {
    const other = state.services.find((s) => s.id !== id && !s.isTemplate);
    if (other) await openService(other.id);
    else useStore.setState({ service: null, selectedItemId: null, adhoc: null });
  }
  await attempt(async () => {
    await cmd('service.delete', { id });
    toast(i18n.t('sidebar.deleted', { name }));
  });
}

/** A saved playlist, read in full (anything unsaved is saved first). */
async function planOf(id: string): Promise<ServicePlan | null> {
  await flushServiceSave();
  return (await attempt(() => q('services.get', { id }))) ?? null;
}

/** A copy of a playlist, opened. */
export async function duplicateService(id: string): Promise<void> {
  const plan = await planOf(id);
  if (plan) await createService({ ...plan, name: i18n.t('sidebar.copyOf', { name: plan.name }) });
}

/** A new playlist from a template, opened. */
export async function serviceFromTemplate(id: string): Promise<void> {
  const plan = await planOf(id);
  if (plan) await createService(plan);
}
