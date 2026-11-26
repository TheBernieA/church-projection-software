import { useState } from 'react';
import { RefreshCw, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BUILT_IN_DESKS, deskProfiles, type Settings } from '@lampstand/core';
import type { DeskStatus } from '@lampstand/ipc-contract';
import { Button, IconButton, Switch, Typography } from '@lampstand/ui';
import { q } from '../../lib/api';
import { ask } from '../../lib/confirm';
import { attempt, toast } from '../../lib/store';
import { DeferredInput } from '../DeferredControls';
import { Select } from '../Select';
import { Group, Row } from './parts';

/**
 * Settings › Audio › Sound desk: which desk (its profile), where it is on the network, and
 * whether it answers. Desks Lampstand doesn't know yet come in as profile files.
 */
export function DeskSettings({
  s,
  update,
}: {
  s: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DeskStatus | null>(null);
  const desk = s.desk;
  const profiles = deskProfiles(s.deskProfiles);
  const profile = profiles.find((p) => p.id === desk.profile) ?? null;
  const custom = s.deskProfiles.find((p) => p.id === desk.profile);
  const set = (patch: Partial<Settings['desk']>): void => {
    setStatus(null);
    update({ desk: { ...desk, ...patch } });
  };
  const check = async (): Promise<void> => {
    const r = await attempt(() => q('desk.status'), 'errors.desk');
    if (r) setStatus(r);
  };
  const importProfile = async (): Promise<void> => {
    const r = await attempt(() => q('desk.importProfile'), 'errors.desk');
    if (!r?.file) return;
    if (!r.profile) {
      toast(t('desk.badProfile', { file: r.file }), 'error');
      return;
    }
    const p = r.profile;
    update({
      deskProfiles: [...s.deskProfiles.filter((x) => x.id !== p.id), p].slice(-20),
      desk: { ...desk, profile: p.id },
    });
    toast(t('desk.profileAdded', { name: p.name }), 'info');
  };
  const removeProfile = async (): Promise<void> => {
    if (!custom) return;
    if (
      !(await ask({
        message: t('desk.removeProfileConfirm', { name: custom.name }),
        tone: 'danger',
      }))
    )
      return;
    update({
      deskProfiles: s.deskProfiles.filter((x) => x.id !== custom.id),
      desk: { ...desk, profile: BUILT_IN_DESKS[0]?.id ?? '' },
    });
  };

  return (
    <Group title={t('desk.title')} footnote={t('desk.footnote')}>
      <Row label={t('desk.enable')} description={t('desk.enableHelp')}>
        <Switch
          label={t('desk.enable')}
          checked={desk.enabled}
          onChange={(enabled) => set({ enabled })}
        />
      </Row>
      {desk.enabled && (
        <>
          <Row label={t('desk.type')} description={profile?.note ?? t('desk.typeHelp')}>
            <div className="flex items-center gap-1.5">
              <div className="w-[260px]">
                <Select<string>
                  size="sm"
                  aria-label={t('desk.type')}
                  value={desk.profile}
                  onChange={(id) => set({ profile: id })}
                  options={profiles.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder={t('desk.choose')}
                />
              </div>
              {custom && (
                <IconButton
                  size="sm"
                  variant="danger"
                  aria-label={t('desk.removeProfile', { name: custom.name })}
                  onClick={() => void removeProfile()}
                >
                  <Trash2 size={14} />
                </IconButton>
              )}
            </div>
          </Row>
          <Row label={t('desk.address')} description={t('desk.addressHelp')}>
            <div className="flex items-center gap-1.5">
              <DeferredInput
                aria-label={t('desk.address')}
                placeholder="192.168.1.50"
                value={desk.host}
                maxLength={253}
                onCommit={(host) => set({ host: host.trim() })}
                className="field !h-8 w-[170px]"
              />
              <DeferredInput
                aria-label={t('desk.port')}
                placeholder={String(profile?.port ?? '')}
                value={desk.port ? String(desk.port) : ''}
                maxLength={5}
                onCommit={(v) => {
                  const n = Number(v);
                  set({
                    port:
                      v.trim() === ''
                        ? 0
                        : Number.isInteger(n) && n > 0 && n < 65_536
                          ? n
                          : desk.port,
                  });
                }}
                className="field !h-8 w-[80px]"
              />
            </div>
          </Row>
          <Row
            label={t('desk.check')}
            description={
              status
                ? status.answering
                  ? t('desk.answering', { desk: status.profile ?? '', host: status.host })
                  : status.answering === false
                    ? t('desk.notAnswering', { host: status.host })
                    : t('desk.notChecked')
                : t('desk.checkHelp')
            }
          >
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw size={14} />}
              disabled={!desk.host}
              onClick={() => void check()}
            >
              {t('desk.check')}
            </Button>
          </Row>
          <Row label={t('desk.importProfile')} description={t('desk.importProfileHelp')}>
            <Button
              size="sm"
              variant="ghost"
              icon={<Upload size={14} />}
              onClick={() => void importProfile()}
            >
              {t('desk.importProfile')}
            </Button>
          </Row>
          {status?.answering && (
            <Typography size={11} tone="muted" leading="snug">
              {t('desk.nextStep')}
            </Typography>
          )}
        </>
      )}
    </Group>
  );
}
