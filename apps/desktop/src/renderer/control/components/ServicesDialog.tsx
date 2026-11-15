import { useTranslation } from 'react-i18next';
import { SoonList } from './Soon';
import { newId, nowIso, SERVICE_SCHEMA_VERSION, type ServicePlan } from '@lampstand/core';
import { Button } from '@lampstand/ui';
import { cmd, q } from '../lib/api';
import {
  attempt,
  closeDialog,
  editService,
  flushServiceSave,
  openService,
  toast,
  useStore,
} from '../lib/store';
import i18n from '../i18n';
import { Dialog } from './Dialog';

async function create(from?: ServicePlan, asTemplate = false): Promise<void> {
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

/** Open/create services and templates ("Sunday morning"). */
export function ServicesDialog() {
  const { t } = useTranslation();
  const services = useStore((s) => s.services);
  const current = useStore((s) => s.service);
  const rename = (name: string): void => {
    if (!current || !name.trim()) return;
    editService((s) => ({ ...s, name: name.trim() }));
  };
  const close = (): void => closeDialog();

  return (
    <Dialog name="services" title={t('top.services')}>
      {current && (
        <div className="mb-5">
          <label className="label" htmlFor="svc-name">
            {t('service.rename')}
          </label>
          <input
            id="svc-name"
            className="field"
            defaultValue={current.name}
            key={current.id}
            onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void create().then(close)}>
              + {t('service.new')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void create(current).then(close)}>
              {t('service.newFromTemplate')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void create(current, true)}>
              {t('service.saveAsTemplate')}
            </Button>
          </div>
        </div>
      )}
      {(['templates', 'recent'] as const).map((group) => {
        const list = services.filter((s) => s.isTemplate === (group === 'templates'));
        if (!list.length) return null;
        return (
          <section key={group} className="mb-4">
            <h3 className="label">{t(`service.${group}`)}</h3>
            <ul>
              {list.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--surface-2)]"
                >
                  <span
                    className={`flex-1 truncate ${s.id === current?.id ? 'font-semibold text-[var(--accent)]' : ''}`}
                  >
                    {s.name}
                  </span>
                  <span className="text-[11px] text-[var(--text-3)]">
                    {s.itemCount} · {s.updatedAt.slice(0, 10)}
                  </span>
                  {group === 'templates' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void q('services.get', { id: s.id }).then(async (plan) => {
                          if (plan) await create(plan);
                          close();
                        })
                      }
                    >
                      {t('service.new')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={s.id === current?.id}
                      onClick={() => void openService(s.id).then(close)}
                    >
                      {t('service.open')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <details className="mt-5 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
        <summary className="cursor-pointer px-4 py-2.5 text-[12px] font-semibold text-[var(--text-2)]">
          {t('service.syncSoon')}
        </summary>
        <SoonList ids={['planning-center', 'calendar', 'cloud']} />
      </details>
    </Dialog>
  );
}
