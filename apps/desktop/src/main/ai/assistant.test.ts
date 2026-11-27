import { describe, expect, it } from 'vitest';
import type { PlanDraft } from '@lampstand/planner';
import type { SecretStore } from '../secrets/secretStore';
import type { Logger } from '../types';
import { ASSISTANT_KEY, ASSISTANT_MODEL, Assistant, type Client } from './assistant';

const KEY = `sk-ant-api03-${'a'.repeat(40)}`;

function setup(reply: Awaited<ReturnType<Client['messages']['parse']>> | Error) {
  const store = new Map<string, string>();
  const secrets = {
    has: (n: string) => Promise.resolve(store.has(n)),
    get: (n: string) => Promise.resolve(store.get(n) ?? null),
    set: (n: string, v: string) => Promise.resolve(void store.set(n, v)),
    delete: (n: string) => Promise.resolve(void store.delete(n)),
  } as unknown as SecretStore;
  const lines: string[] = [];
  const log = {
    info: (m: string, d?: unknown) => lines.push(`${m} ${JSON.stringify(d ?? {})}`),
    warn: (m: string, d?: unknown) => lines.push(`${m} ${JSON.stringify(d ?? {})}`),
  } as unknown as Logger;
  const calls: Record<string, unknown>[] = [];
  const keys: string[] = [];
  const assistant = new Assistant({
    secrets,
    log,
    client: (apiKey) => {
      keys.push(apiKey);
      return {
        checkModel: () => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve()),
        messages: {
          parse: (params) => {
            calls.push(params);
            return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
          },
        },
      };
    },
  });
  return { assistant, store, lines, calls, keys };
}

const draft: PlanDraft = { name: 'Sunday', date: null, items: [], questions: [] };

describe('Assistant', () => {
  it('needs a key before anything is sent', async () => {
    const { assistant, calls } = setup({ stop_reason: 'end_turn', parsed_output: draft });
    await expect(assistant.planService({ text: 'x' })).rejects.toMatchObject({
      code: 'assistant-no-key',
    });
    expect(calls).toHaveLength(0);
  });

  it('checks a key before saving it, and refuses what is not a key', async () => {
    const { assistant, store } = setup({ stop_reason: 'end_turn', parsed_output: draft });
    await expect(assistant.setKey('hello')).rejects.toMatchObject({
      code: 'assistant-key-format',
    });
    await assistant.setKey(`  ${KEY} `);
    expect(store.get(ASSISTANT_KEY)).toBe(KEY);
    expect(await assistant.hasKey()).toBe(true);
    await assistant.forgetKey();
    expect(await assistant.hasKey()).toBe(false);
  });

  it('plans with structured output and the plan as data, and never logs the key or the text', async () => {
    const { assistant, store, calls, keys, lines } = setup({
      stop_reason: 'end_turn',
      parsed_output: draft,
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    store.set(ASSISTANT_KEY, KEY);
    expect(await assistant.planService({ text: 'Secret sermon plan' })).toEqual(draft);
    expect(keys).toEqual([KEY]);
    const p = calls[0]!;
    expect(p.model).toBe(ASSISTANT_MODEL);
    expect(p.fallbacks).toBe('default');
    expect(JSON.stringify(p.messages)).toContain('<plan>\\nSecret sermon plan\\n</plan>');
    expect(p.output_config).toMatchObject({ effort: 'medium' });
    expect(lines.join('\n')).not.toContain(KEY);
    expect(lines.join('\n')).not.toContain('Secret sermon plan');
  });

  it('turns a refusal or a cut-off answer into plain words', async () => {
    const refused = setup({ stop_reason: 'refusal', parsed_output: null });
    refused.store.set(ASSISTANT_KEY, KEY);
    await expect(refused.assistant.planService({ text: 'x' })).rejects.toMatchObject({
      code: 'assistant-refused',
    });
    const cut = setup({ stop_reason: 'max_tokens', parsed_output: null });
    cut.store.set(ASSISTANT_KEY, KEY);
    await expect(cut.assistant.structureLyrics('x')).rejects.toMatchObject({
      code: 'assistant-too-long',
    });
    const bad = setup({ stop_reason: 'end_turn', parsed_output: { name: 1 } });
    bad.store.set(ASSISTANT_KEY, KEY);
    await expect(bad.assistant.planService({ text: 'x' })).rejects.toMatchObject({
      code: 'assistant-failed',
    });
  });

  it('a network failure is a plain error, not a crash', async () => {
    const { assistant, store } = setup(new TypeError('socket hang up'));
    store.set(ASSISTANT_KEY, KEY);
    await expect(assistant.planService({ text: 'x' })).rejects.toMatchObject({
      code: 'assistant-failed',
    });
  });
});
