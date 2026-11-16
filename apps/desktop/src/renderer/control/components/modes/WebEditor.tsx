import { useState } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { makeScene, WebUrlSchema } from '@lampstand/core';
import { updateItem } from '../../lib/store';
import { SceneView } from '../SceneView';
import { type WebItem } from '../../types';

/**
 * Edit a web page item: its name and https address. The address is only saved once it's valid,
 * so the service never holds a page the outputs would refuse to show.
 */
export function WebEditor({ item }: { item: WebItem }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(item.url);
  const valid = WebUrlSchema.safeParse(url.trim()).success;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
      <div className="flex items-center gap-2">
        <Globe size={18} className="text-[var(--text-3)]" />
        <h2 className="text-ui-15 font-semibold">{t('web.title')}</h2>
      </div>
      <div className="grid max-w-xl gap-4">
        <label className="flex flex-col gap-1.5 text-ui-12 font-medium text-[var(--text-2)]">
          {t('web.name')}
          <input
            className="field"
            value={item.title}
            maxLength={200}
            onChange={(e) =>
              updateItem<WebItem>(item.id, (x) => ({ ...x, title: e.target.value }), {
                typing: true,
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1.5 text-ui-12 font-medium text-[var(--text-2)]">
          {t('web.address')}
          <input
            className="field"
            value={url}
            maxLength={2000}
            placeholder="https://"
            aria-invalid={!valid}
            onChange={(e) => {
              setUrl(e.target.value);
              const next = e.target.value.trim();
              if (WebUrlSchema.safeParse(next).success)
                updateItem<WebItem>(item.id, (x) => ({ ...x, url: next }), { typing: true });
            }}
          />
          <span
            className={`font-normal ${valid ? 'text-[var(--text-3)]' : 'text-[var(--warning)]'}`}
          >
            {valid ? t('web.help') : t('web.invalid')}
          </span>
        </label>
      </div>
      <div className="w-full max-w-xl overflow-hidden rounded-[4px] shadow-[0_0_0_1px_var(--hairline-strong)]">
        <SceneView scene={makeScene({ web: { key: item.id, url: item.url } })} />
      </div>
    </div>
  );
}
