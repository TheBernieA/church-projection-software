import { useTranslation } from 'react-i18next';
import { SoonList } from './Soon';
import { Button, Typography } from '@lampstand/ui';
import { q } from '../lib/api';
import { closeDialog, editService, openService, useStore } from '../lib/store';
import { Dialog } from './Dialog';
import { createService } from '../lib/services';

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
          <Typography as="label" variant="field" htmlFor="svc-name">
            {t('service.rename')}
          </Typography>
          <input
            id="svc-name"
            className="field"
            defaultValue={current.name}
            key={current.id}
            onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void createService().then(close)}>
              + {t('service.new')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void createService(current).then(close)}
            >
              {t('service.newFromTemplate')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void createService(current, true)}>
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
            <Typography as="h3" variant="field">
              {t(`service.${group}`)}
            </Typography>
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
                  <Typography size={11} tone="muted">
                    {s.itemCount} · {s.updatedAt.slice(0, 10)}
                  </Typography>
                  {group === 'templates' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void q('services.get', { id: s.id }).then(async (plan) => {
                          if (plan) await createService(plan);
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
        <Typography
          as="summary"
          size={12}
          tone="secondary"
          weight="semibold"
          className="cursor-pointer px-4 py-2.5"
        >
          {t('service.syncSoon')}
        </Typography>
        <SoonList ids={['planning-center', 'calendar', 'cloud']} />
      </details>
    </Dialog>
  );
}
