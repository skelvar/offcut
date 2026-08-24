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
