import { newId, nowIso, SERVICE_SCHEMA_VERSION, type ServicePlan } from '@lampstand/core';
import { cmd } from './api';
import { attempt, flushServiceSave, openService, toast } from './store';
import i18n from '../i18n';

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
        ? `${from.name} (template)`
        : from.name.replace(/ \(template\)$/, '')
      : 'New service',
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
