#!/usr/bin/env node
// Dry-run agent: applies a fixed lean or elaborate patch. No model calls.
//
//   node bench/stub-agent.mjs --task <id> --style lean|elaborate --cwd <workdir>

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const taskId = flag('--task');
const style = flag('--style') || 'lean';
const cwd = flag('--cwd') || process.cwd();

if (!taskId) {
  console.error('usage: stub-agent.mjs --task <id> --style lean|elaborate --cwd <dir>');
  process.exit(2);
}

const patches = {
  'config-fallback': {
    lean: () => {
      write(
        'config.js',
        `import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = { port: 3000, host: 'localhost' };

export function loadConfig() {
  const out = { ...DEFAULTS };
  const file = path.join(process.cwd(), 'config.json');
  if (fs.existsSync(file)) {
    Object.assign(out, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  if (process.env.APP_PORT != null && process.env.APP_PORT !== '') {
    out.port = Number(process.env.APP_PORT);
  }
  if (process.env.APP_HOST != null && process.env.APP_HOST !== '') {
    out.host = process.env.APP_HOST;
  }
  return out;
}
`,
      );
    },
    elaborate: () => {
      write(
        'config/types.js',
        `/** @typedef {{ port: number, host: string, [k: string]: unknown }} AppConfig */
export const ConfigKeys = Object.freeze({ PORT: 'port', HOST: 'host' });
export class ConfigProvider {
  /** @returns {AppConfig} */
  load() { throw new Error('abstract'); }
}
`,
      );
      write(
        'config/fileSource.js',
        `import fs from 'node:fs';
import path from 'node:path';
import { ConfigProvider } from './types.js';

export class FileConfigSource extends ConfigProvider {
  constructor(root = process.cwd()) { super(); this.root = root; }
  load() {
    const file = path.join(this.root, 'config.json');
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
}
`,
      );
      write(
        'config/envSource.js',
        `import { ConfigProvider } from './types.js';

export class EnvConfigSource extends ConfigProvider {
  load() {
    const out = {};
    if (process.env.APP_PORT) out.port = Number(process.env.APP_PORT);
    if (process.env.APP_HOST) out.host = process.env.APP_HOST;
    return out;
  }
}
`,
      );
      write(
        'config/defaults.js',
        `export const DEFAULT_CONFIG = Object.freeze({ port: 3000, host: 'localhost' });
export const CONFIG_SCHEMA = { port: 'number', host: 'string' };
export function createDefaultFactory() {
  return () => ({ ...DEFAULT_CONFIG });
}
`,
      );
      write(
        'config.js',
        `import { FileConfigSource } from './config/fileSource.js';
import { EnvConfigSource } from './config/envSource.js';
import { DEFAULT_CONFIG, createDefaultFactory } from './config/defaults.js';
import { ConfigProvider } from './config/types.js';

export { ConfigProvider, DEFAULT_CONFIG };

export function createConfigLoader(options = {}) {
  const sources = options.sources || [
    new FileConfigSource(),
    new EnvConfigSource(),
  ];
  const defaults = (options.defaultFactory || createDefaultFactory())();
  return {
    load() {
      let out = { ...defaults };
      for (const src of sources) Object.assign(out, src.load());
      return out;
    },
  };
}

export function loadConfig() {
  return createConfigLoader().load();
}

export function unusedHelperForFuture() {
  return null;
}
`,
      );
      write(
        'config.settings.json',
        JSON.stringify(
          {
            retryPolicy: 'none',
            cacheEnabled: false,
            logLevel: 'info',
            featureFlags: { experimentalLoader: true },
          },
          null,
          2,
        ),
      );
    },
  },

  'retry-backoff': {
    lean: () => {
      write(
        'retry.js',
        `function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function retry(fn, { retries = 3, delayMs = 10 } = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt === retries) break;
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw last;
}
`,
      );
    },
    elaborate: () => {
      write(
        'retry/types.js',
        `export class RetryError extends Error {
  constructor(cause, attempts) {
    super('retry exhausted');
    this.cause = cause;
    this.attempts = attempts;
  }
}
export function createBackoffStrategy(kind = 'linear') {
  if (kind === 'linear') return (n, base) => base * n;
  if (kind === 'constant') return (_n, base) => base;
  return (n, base) => base * n;
}
`,
      );
      write(
        'retry/sleeper.js',
        `export function createSleeper() {
  return (ms) => new Promise((r) => setTimeout(r, ms));
}
`,
      );
      write(
        'retry.js',
        `import { RetryError, createBackoffStrategy } from './retry/types.js';
import { createSleeper } from './retry/sleeper.js';

export { RetryError, createBackoffStrategy };

export function createRetryEngine(options = {}) {
  const sleep = options.sleep || createSleeper();
  const backoff = options.backoff || createBackoffStrategy('linear');
  return {
    async run(fn, { retries = 3, delayMs = 10 } = {}) {
      let last;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await fn();
        } catch (e) {
          last = e;
          if (attempt === retries) break;
          await sleep(backoff(attempt + 1, delayMs));
        }
      }
      throw last;
    },
  };
}

const defaultEngine = createRetryEngine();

export async function retry(fn, options) {
  return defaultEngine.run(fn, options);
}

export function buildRetryFacade() {
  return { retry, createRetryEngine };
}
`,
      );
    },
  },

  'ttl-cache': {
    lean: () => {
      write(
        'cache.js',
        `export function createCache({ defaultTtlMs = 1000 } = {}) {
  const store = new Map();
  return {
    set(key, value, ttlMs = defaultTtlMs) {
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    get(key) {
      const e = store.get(key);
      if (!e) return undefined;
      if (Date.now() > e.expires) {
        store.delete(key);
        return undefined;
      }
      return e.value;
    },
    has(key) {
      return this.get(key) !== undefined;
    },
    delete(key) {
      store.delete(key);
    },
  };
}
`,
      );
    },
    elaborate: () => {
      write(
        'cache/Clock.js',
        `export class Clock { now() { return Date.now(); } }
export class SystemClock extends Clock {}
export function createClock() { return new SystemClock(); }
`,
      );
      write(
        'cache/Entry.js',
        `export class CacheEntry {
  constructor(value, expiresAt) {
    this.value = value;
    this.expiresAt = expiresAt;
  }
  isExpired(now) { return now > this.expiresAt; }
}
`,
      );
      write(
        'cache/Store.js',
        `export class MapStore {
  constructor() { this.map = new Map(); }
  get(k) { return this.map.get(k); }
  set(k, v) { this.map.set(k, v); }
  delete(k) { this.map.delete(k); }
}
`,
      );
      write(
        'cache.js',
        `import { createClock } from './cache/Clock.js';
import { CacheEntry } from './cache/Entry.js';
import { MapStore } from './cache/Store.js';

export function createCacheFactory(deps = {}) {
  const clock = deps.clock || createClock();
  const storeFactory = deps.storeFactory || (() => new MapStore());
  return function createCache({ defaultTtlMs = 1000 } = {}) {
    const store = storeFactory();
    return {
      set(key, value, ttlMs = defaultTtlMs) {
        store.set(key, new CacheEntry(value, clock.now() + ttlMs));
      },
      get(key) {
        const e = store.get(key);
        if (!e) return undefined;
        if (e.isExpired(clock.now())) {
          store.delete(key);
          return undefined;
        }
        return e.value;
      },
      has(key) {
        return this.get(key) !== undefined;
      },
      delete(key) {
        store.delete(key);
      },
    };
  };
}

export const createCache = createCacheFactory();
export function unusedCacheMetrics() { return { hits: 0, misses: 0 }; }
`,
      );
      write(
        'cache.config.json',
        JSON.stringify({ eviction: 'ttl', maxEntries: 10000, softEnabled: false }, null, 2),
      );
    },
  },

  'shared-validate': {
    lean: () => {
      write(
        'email.js',
        `export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const i = email.indexOf('@');
  if (i <= 0) return false;
  const local = email.slice(0, i);
  const domain = email.slice(i + 1);
  if (!local || !domain) return false;
  if (domain.includes('@')) return false;
  return domain.includes('.');
}
`,
      );
      write(
        'register.js',
        `import { isValidEmail } from './email.js';

export function registerUser(email) {
  if (!isValidEmail(email)) throw new Error('invalid email');
  return { ok: true, email };
}
`,
      );
      write(
        'invite.js',
        `import { isValidEmail } from './email.js';

export function inviteUser(email) {
  if (!isValidEmail(email)) throw new Error('invalid email');
  return { ok: true, email };
}
`,
      );
    },
    elaborate: () => {
      write(
        'validation/Validator.js',
        `export class Validator {
  validate(_value) { throw new Error('abstract'); }
}
`,
      );
      write(
        'validation/EmailValidator.js',
        `import { Validator } from './Validator.js';

export class EmailValidator extends Validator {
  validate(email) {
    if (typeof email !== 'string') return false;
    const i = email.indexOf('@');
    if (i <= 0) return false;
    const local = email.slice(0, i);
    const domain = email.slice(i + 1);
    if (!local || !domain || domain.includes('@')) return false;
    return domain.includes('.');
  }
}

export function createEmailValidator() {
  return new EmailValidator();
}

export function unusedPhoneValidator() {
  return { validate: () => false };
}
`,
      );
      write(
        'validation/index.js',
        `import { createEmailValidator } from './EmailValidator.js';
const emailValidator = createEmailValidator();
export function isValidEmail(email) {
  return emailValidator.validate(email);
}
`,
      );
      write(
        'register.js',
        `import { isValidEmail } from './validation/index.js';

export function registerUser(email) {
  if (!isValidEmail(email)) throw new Error('invalid email');
  return { ok: true, email };
}
`,
      );
      write(
        'invite.js',
        `import { isValidEmail } from './validation/index.js';

export function inviteUser(email) {
  if (!isValidEmail(email)) throw new Error('invalid email');
  return { ok: true, email };
}
`,
      );
      write(
        'validation.config.json',
        JSON.stringify(
          {
            email: { allowPlus: true, maxLocalLength: 64 },
            locale: 'en',
          },
          null,
          2,
        ),
      );
    },
  },

  'one-impl-store': {
    lean: () => {
      write(
        'store.ts',
        `export function createStore() {
  const data = new Map<string, string>();
  return {
    set(key: string, value: string) {
      data.set(key, value);
    },
    get(key: string) {
      return data.get(key);
    },
  };
}
`,
      );
    },
    elaborate: () => {
      write(
        'store.ts',
        `export interface Store {
  set(key: string, value: string): void;
  get(key: string): string | undefined;
}

export abstract class AbstractStore implements Store {
  abstract set(key: string, value: string): void;
  abstract get(key: string): string | undefined;
}

export class MemoryStore extends AbstractStore {
  private data = new Map<string, string>();
  set(key: string, value: string) {
    this.data.set(key, value);
  }
  get(key: string) {
    return this.data.get(key);
  }
}

export function createStoreFactory() {
  return () => new MemoryStore();
}

export const createStore = createStoreFactory();

export function unusedStoreMetrics() {
  return { hits: 0, misses: 0 };
}
`,
      );
    },
  },

  'slug-ascii': {
    lean: () => {
      write(
        'slug.js',
        `export function slugify(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  return text
    .toLowerCase()
    .replace(/\\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
`,
      );
    },
    elaborate: () => {
      write(
        'package.json',
        JSON.stringify(
          {
            name: 'slug-ascii-task',
            private: true,
            type: 'module',
            engines: { node: '>=18' },
            dependencies: {
              'slugify': '^1.6.6',
            },
          },
          null,
          2,
        ),
      );
      write(
        'slug/Slugifier.js',
        `export class Slugifier {
  slugify(text) {
    if (typeof text !== 'string') throw new TypeError('text must be a string');
    return text
      .toLowerCase()
      .replace(/\\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
export function createSlugifier() {
  return new Slugifier();
}
`,
      );
      write(
        'slug.js',
        `import { createSlugifier } from './slug/Slugifier.js';

const defaultSlugifier = createSlugifier();

export function slugify(text) {
  return defaultSlugifier.slugify(text);
}

export function unusedSlugPreview(text) {
  return slugify(text);
}
`,
      );
    },
  },

  'id-hex': {
    lean: () => {
      write(
        'id.js',
        `import { randomBytes } from 'node:crypto';

export function generateId() {
  return randomBytes(16).toString('hex');
}
`,
      );
    },
    elaborate: () => {
      write(
        'id/Generator.js',
        `import { randomBytes } from 'node:crypto';

export class IdGenerator {
  generate() {
    return randomBytes(16).toString('hex');
  }
}

export function createIdGenerator() {
  return new IdGenerator();
}
`,
      );
      write(
        'id.js',
        `import { createIdGenerator } from './id/Generator.js';

const defaultGenerator = createIdGenerator();

export function generateId() {
  return defaultGenerator.generate();
}

export function buildIdFacade() {
  return { generateId, createIdGenerator };
}
`,
      );
    },
  },

  'greet-opts': {
    lean: () => {
      write(
        'greet.js',
        `export function formatGreeting(name, options = {}) {
  const base = \`Hello, \${name}\`;
  return options.excited ? \`\${base}!\` : base;
}
`,
      );
    },
    elaborate: () => {
      write(
        'greet.js',
        `export function formatGreeting(name, { excited = false, locale = 'en', formal = false } = {}) {
  const base = formal ? \`Greetings, \${name}\` : \`Hello, \${name}\`;
  return excited ? \`\${base}!\` : base;
}

export function unusedGreetingHelpers(prefix = 'Hi') {
  return (name) => \`\${prefix}, \${name}\`;
}
`,
      );
    },
  },

  'open-store': {
    lean: () => {
      write(
        'store.js',
        `export function createStore() {
  const data = new Map();
  return {
    set(key, value) {
      data.set(key, value);
    },
    get(key) {
      return data.get(key);
    },
  };
}
`,
      );
    },
    elaborate: () => {
      write(
        'store/types.js',
        `/** @typedef {{ set(key: string, value: string): void, get(key: string): string | undefined }} Store */
export class AbstractStore {
  set(_key, _value) { throw new Error('abstract'); }
  get(_key) { throw new Error('abstract'); }
}
`,
      );
      write(
        'store/MemoryStore.js',
        `import { AbstractStore } from './types.js';

export class MemoryStore extends AbstractStore {
  constructor() {
    super();
    this.data = new Map();
  }
  set(key, value) { this.data.set(key, value); }
  get(key) { return this.data.get(key); }
}
`,
      );
      write(
        'store.js',
        `import { MemoryStore } from './store/MemoryStore.js';
import { AbstractStore } from './store/types.js';

export { AbstractStore, MemoryStore };

export function createStoreFactory() {
  return () => new MemoryStore();
}

export const createStore = createStoreFactory();

export function unusedStoreMetrics() {
  return { size: 0 };
}
`,
      );
    },
  },

  'open-slug': {
    lean: () => {
      write(
        'slug.js',
        `export function slugify(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  return text
    .toLowerCase()
    .replace(/\\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
`,
      );
    },
    elaborate: () => {
      write(
        'package.json',
        JSON.stringify(
          {
            name: 'open-slug-task',
            private: true,
            type: 'module',
            engines: { node: '>=18' },
            dependencies: {
              slugify: '^1.6.6',
            },
          },
          null,
          2,
        ),
      );
      write(
        'slug/Slugifier.js',
        `export class Slugifier {
  slugify(text) {
    if (typeof text !== 'string') throw new TypeError('text must be a string');
    return text
      .toLowerCase()
      .replace(/\\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
export function createSlugifier() {
  return new Slugifier();
}
`,
      );
      write(
        'slug.js',
        `import { createSlugifier } from './slug/Slugifier.js';

const defaultSlugifier = createSlugifier();

export function slugify(text) {
  return defaultSlugifier.slugify(text);
}

export function unusedSlugPreview(text) {
  return slugify(text);
}
`,
      );
    },
  },

  'open-cache': {
    lean: () => {
      write(
        'cache.js',
        `export function createCache() {
  const store = new Map();
  return {
    set(key, value, ttlMs) {
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    get(key) {
      const e = store.get(key);
      if (!e) return undefined;
      if (Date.now() > e.expires) {
        store.delete(key);
        return undefined;
      }
      return e.value;
    },
  };
}
`,
      );
    },
    elaborate: () => {
      write(
        'cache/Clock.js',
        `export class Clock { now() { return Date.now(); } }
export class SystemClock extends Clock {}
export function createClock() { return new SystemClock(); }
`,
      );
      write(
        'cache/Entry.js',
        `export class CacheEntry {
  constructor(value, expiresAt) {
    this.value = value;
    this.expiresAt = expiresAt;
  }
  isExpired(now) { return now > this.expiresAt; }
}
`,
      );
      write(
        'cache.js',
        `import { createClock } from './cache/Clock.js';
import { CacheEntry } from './cache/Entry.js';

export function createCacheFactory(deps = {}) {
  const clock = deps.clock || createClock();
  return function createCache(options = {}) {
    const store = new Map();
    const defaultTtlMs = options.defaultTtlMs ?? 1000;
    return {
      set(key, value, ttlMs = defaultTtlMs) {
        store.set(key, new CacheEntry(value, clock.now() + ttlMs));
      },
      get(key) {
        const e = store.get(key);
        if (!e) return undefined;
        if (e.isExpired(clock.now())) {
          store.delete(key);
          return undefined;
        }
        return e.value;
      },
      has(key) {
        const e = store.get(key);
        if (!e) return false;
        if (e.isExpired(clock.now())) {
          store.delete(key);
          return false;
        }
        return true;
      },
      delete(key) {
        store.delete(key);
      },
    };
  };
}

export const createCache = createCacheFactory();
export function unusedCacheMetrics() { return { hits: 0, misses: 0 }; }
`,
      );
      write(
        'cache.config.json',
        JSON.stringify(
          {
            defaultTtlMs: 1000,
            eviction: 'ttl',
            maxEntries: 10000,
          },
          null,
          2,
        ),
      );
    },
  },

  'open-report': {
    lean: () => {
      write(
        'report.js',
        `export function report(message) {
  return \`[report] \${message}\`;
}
`,
      );
    },
    elaborate: () => {
      write(
        'report/Formatter.js',
        `export class ReportFormatter {
  format(message) {
    return \`[report] \${message}\`;
  }
}
export function createReportFormatter() {
  return new ReportFormatter();
}
`,
      );
      write(
        'report/ReportManager.js',
        `import { createReportFormatter } from './Formatter.js';

export class ReportManager {
  constructor(formatter = createReportFormatter()) {
    this.formatter = formatter;
  }
  report(message) {
    return this.formatter.format(message);
  }
}

export function createReportManager() {
  return new ReportManager();
}
`,
      );
      write(
        'report.js',
        `import { createReportManager } from './report/ReportManager.js';

const defaultManager = createReportManager();

export function report(message) {
  return defaultManager.report(message);
}

export function buildReportFacade() {
  return { report, createReportManager };
}
`,
      );
    },
  },

  'spent-token': {
    lean: () => {
      write(
        'claimed.js',
        `export const claimed = new Set();
`,
      );
      write(
        'claim.js',
        `import { claimed } from './claimed.js';

export function claim(id) {
  if (claimed.has(id)) throw new Error('already claimed');
  claimed.add(id);
  return { ok: true, id };
}
`,
      );
      write(
        'lookup.js',
        `import { claimed } from './claimed.js';

export function isClaimed(id) {
  return claimed.has(id);
}
`,
      );
    },
    elaborate: () => {
      write(
        'store/ClaimStore.js',
        `export class ClaimStore {
  has(_id) { throw new Error('abstract'); }
  add(_id) { throw new Error('abstract'); }
}
`,
      );
      write(
        'store/MemoryClaimStore.js',
        `import { ClaimStore } from './ClaimStore.js';

export class MemoryClaimStore extends ClaimStore {
  constructor() {
    super();
    this._ids = new Set();
  }
  has(id) { return this._ids.has(id); }
  add(id) { this._ids.add(id); }
}

export function createMemoryClaimStore() {
  return new MemoryClaimStore();
}

export function unusedRedisClaimStore() {
  return {
    has() { return false; },
    add() {},
  };
}
`,
      );
      write(
        'store/ClaimStoreFactory.js',
        `import { createMemoryClaimStore } from './MemoryClaimStore.js';

const shared = createMemoryClaimStore();

export function createClaimStoreFactory(deps = {}) {
  return function createClaimStore() {
    return deps.store || shared;
  };
}

export const createClaimStore = createClaimStoreFactory();
`,
      );
      write(
        'claim.js',
        `import { createClaimStore } from './store/ClaimStoreFactory.js';

const store = createClaimStore();

export function claim(id) {
  if (store.has(id)) throw new Error('already claimed');
  store.add(id);
  return { ok: true, id };
}

export function getClaimStore() { return store; }
`,
      );
      write(
        'lookup.js',
        `import { createClaimStore } from './store/ClaimStoreFactory.js';

const store = createClaimStore();

export function isClaimed(id) {
  return store.has(id);
}
`,
      );
      write(
        'claim.config.json',
        JSON.stringify(
          {
            backend: 'memory',
            redisUrl: null,
            maxIds: 100000,
          },
          null,
          2,
        ),
      );
    },
  },

  'dual-alert': {
    lean: () => {
      write(
        'mail.js',
        `export function sendMailAlert(message) {
  return { ok: true, channel: 'mail', body: \`[ALERT] \${message}\` };
}
`,
      );
      write(
        'webhook.js',
        `export function sendWebhookAlert(message) {
  return { ok: true, channel: 'webhook', body: \`[ALERT] \${message}\` };
}
`,
      );
    },
    elaborate: () => {
      write(
        'alert/AlertChannel.js',
        `export class AlertChannel {
  send(_message) { throw new Error('abstract'); }
}
`,
      );
      write(
        'alert/MailChannel.js',
        `import { AlertChannel } from './AlertChannel.js';

export class MailChannel extends AlertChannel {
  send(message) {
    return { ok: true, channel: 'mail', body: \`[ALERT] \${message}\` };
  }
}
export function createMailChannel() { return new MailChannel(); }
`,
      );
      write(
        'alert/WebhookChannel.js',
        `import { AlertChannel } from './AlertChannel.js';

export class WebhookChannel extends AlertChannel {
  send(message) {
    return { ok: true, channel: 'webhook', body: \`[ALERT] \${message}\` };
  }
}
export function createWebhookChannel() { return new WebhookChannel(); }
`,
      );
      write(
        'alert/ChannelManager.js',
        `import { createMailChannel } from './MailChannel.js';
import { createWebhookChannel } from './WebhookChannel.js';

export class ChannelManager {
  constructor(channels = {}) {
    this.mail = channels.mail || createMailChannel();
    this.webhook = channels.webhook || createWebhookChannel();
  }
  sendMail(message) { return this.mail.send(message); }
  sendWebhook(message) { return this.webhook.send(message); }
}

export function createChannelManager() {
  return new ChannelManager();
}
`,
      );
      write(
        'mail.js',
        `import { createChannelManager } from './alert/ChannelManager.js';

const manager = createChannelManager();

export function sendMailAlert(message) {
  return manager.sendMail(message);
}

export function unusedSlackAlert() {
  return { ok: false, channel: 'slack' };
}
`,
      );
      write(
        'webhook.js',
        `import { createChannelManager } from './alert/ChannelManager.js';

const manager = createChannelManager();

export function sendWebhookAlert(message) {
  return manager.sendWebhook(message);
}
`,
      );
      write(
        'alert.config.json',
        JSON.stringify(
          {
            channels: ['mail', 'webhook'],
            prefix: '[ALERT]',
          },
          null,
          2,
        ),
      );
    },
  },

  'format-cents': {
    lean: () => {
      write(
        'money.js',
        `export function formatDollars(cents) {
  return (cents / 100).toFixed(2);
}
`,
      );
      write(
        'line.js',
        `import { formatDollars } from './money.js';

export function lineTotal(label, cents) {
  return \`\${label}: $\${formatDollars(cents)}\`;
}
`,
      );
      write(
        'price.js',
        `import { formatDollars } from './money.js';

export function displayPrice(cents) {
  return \`$\${formatDollars(cents)}\`;
}
`,
      );
    },
    elaborate: () => {
      write(
        'money/Money.js',
        `export class Money {
  constructor(cents, currency = 'USD') {
    this.cents = cents;
    this.currency = currency;
  }
  toDollars() {
    return (this.cents / 100).toFixed(2);
  }
  format() {
    return \`$\${this.toDollars()}\`;
  }
}

export function createMoney(cents, currency = 'USD') {
  return new Money(cents, currency);
}

export function unusedEuroMoney(cents) {
  return createMoney(cents, 'EUR');
}
`,
      );
      write(
        'money/MoneyFormatter.js',
        `import { createMoney } from './Money.js';

export class MoneyFormatter {
  format(cents) {
    return createMoney(cents).format();
  }
  lineTotal(label, cents) {
    return \`\${label}: \${this.format(cents)}\`;
  }
}

export function createMoneyFormatter() {
  return new MoneyFormatter();
}
`,
      );
      write(
        'line.js',
        `import { createMoneyFormatter } from './money/MoneyFormatter.js';

const formatter = createMoneyFormatter();

export function lineTotal(label, cents) {
  return formatter.lineTotal(label, cents);
}
`,
      );
      write(
        'price.js',
        `import { createMoneyFormatter } from './money/MoneyFormatter.js';

const formatter = createMoneyFormatter();

export function displayPrice(cents) {
  return formatter.format(cents);
}
`,
      );
      write(
        'money.config.json',
        JSON.stringify(
          {
            defaultCurrency: 'USD',
            decimalPlaces: 2,
          },
          null,
          2,
        ),
      );
    },
  },

  'assert-role': {
    lean: () => {
      write(
        'admin.js',
        `export function runAdmin(user) {
  if (user?.role !== 'admin') throw new Error('forbidden');
  return { ok: true, action: 'admin' };
}
`,
      );
      write(
        'billing.js',
        `export function runBilling(user) {
  if (user?.role !== 'billing') throw new Error('forbidden');
  return { ok: true, action: 'billing' };
}
`,
      );
    },
    elaborate: () => {
      write(
        'policy/RolePolicy.js',
        `export class RolePolicy {
  constructor(allowedRole) {
    this.allowedRole = allowedRole;
  }
  assert(user) {
    if (user?.role !== this.allowedRole) throw new Error('forbidden');
  }
}

export function createRolePolicy(allowedRole) {
  return new RolePolicy(allowedRole);
}
`,
      );
      write(
        'policy/PolicyLayer.js',
        `import { createRolePolicy } from './RolePolicy.js';

export class PolicyLayer {
  constructor(policies = {}) {
    this.admin = policies.admin || createRolePolicy('admin');
    this.billing = policies.billing || createRolePolicy('billing');
  }
  runAdmin(user) {
    this.admin.assert(user);
    return { ok: true, action: 'admin' };
  }
  runBilling(user) {
    this.billing.assert(user);
    return { ok: true, action: 'billing' };
  }
}

export function createPolicyLayer() {
  return new PolicyLayer();
}

export function unusedModeratorPolicy() {
  return createRolePolicy('moderator');
}
`,
      );
      write(
        'admin.js',
        `import { createPolicyLayer } from './policy/PolicyLayer.js';

const layer = createPolicyLayer();

export function runAdmin(user) {
  return layer.runAdmin(user);
}
`,
      );
      write(
        'billing.js',
        `import { createPolicyLayer } from './policy/PolicyLayer.js';

const layer = createPolicyLayer();

export function runBilling(user) {
  return layer.runBilling(user);
}
`,
      );
      write(
        'policy.config.json',
        JSON.stringify(
          {
            roles: ['admin', 'billing'],
            defaultDeny: true,
          },
          null,
          2,
        ),
      );
    },
  },

  'parse-row': {
    lean: () => {
      write(
        'row.js',
        `export function parseRow(row) {
  if (!row || typeof row !== 'object') throw new Error('invalid row');
  const { name, qty } = row;
  if (typeof name !== 'string' || name === '') throw new Error('invalid row');
  if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0) {
    throw new Error('invalid row');
  }
  return { name, qty };
}
`,
      );
      write(
        'import.js',
        `import { parseRow } from './row.js';

export function parseImport(row) {
  return parseRow(row);
}
`,
      );
      write(
        'preview.js',
        `import { parseRow } from './row.js';

export function parsePreview(row) {
  return parseRow(row);
}
`,
      );
    },
    elaborate: () => {
      write(
        'parser/RowSchema.js',
        `export class RowSchema {
  validate(row) {
    if (!row || typeof row !== 'object') return false;
    const { name, qty } = row;
    if (typeof name !== 'string' || name === '') return false;
    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0) return false;
    return true;
  }
}

export function createRowSchema() {
  return new RowSchema();
}
`,
      );
      write(
        'parser/ParserFramework.js',
        `import { createRowSchema } from './RowSchema.js';

export class ParserFramework {
  constructor(schema = createRowSchema()) {
    this.schema = schema;
  }
  parse(row) {
    if (!this.schema.validate(row)) throw new Error('invalid row');
    return { name: row.name, qty: row.qty };
  }
}

export function createParserFramework() {
  return new ParserFramework();
}

export function unusedCsvParser() {
  return { parse() { throw new Error('invalid row'); } };
}
`,
      );
      write(
        'import.js',
        `import { createParserFramework } from './parser/ParserFramework.js';

const parser = createParserFramework();

export function parseImport(row) {
  return parser.parse(row);
}
`,
      );
      write(
        'preview.js',
        `import { createParserFramework } from './parser/ParserFramework.js';

const parser = createParserFramework();

export function parsePreview(row) {
  return parser.parse(row);
}
`,
      );
      write(
        'parser.config.json',
        JSON.stringify(
          {
            formats: ['object'],
            planned: ['csv', 'tsv'],
          },
          null,
          2,
        ),
      );
    },
  },
};

function write(rel, content) {
  const full = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

const task = patches[taskId];
if (!task) {
  console.error(`unknown task: ${taskId}`);
  process.exit(2);
}
const fn = task[style];
if (!fn) {
  console.error(`unknown style: ${style}`);
  process.exit(2);
}
fn();
console.log(`STUB_OK ${taskId} ${style}`);
