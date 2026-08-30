# Phase 0 — Does the problem occur?

**Answer: over-building does not appear.** On this class of work, for
`claude-sonnet-5`, vague prompts that left room for interfaces, dependencies,
config surfaces, and layering still produced small direct implementations.
Nine of twelve runs passed accept and were lean under the pre-committed
rubric. Three `open-report` runs failed accept by writing CommonJS
`module.exports` into an ESM package — broken, not over-built. n=12 shows
presence or absence, not a rate.

This is a base-rate observation (one arm, mode `off`), not a treatment
comparison. Offcut signals are listed only as description; the verdict is the
hand judgment against the frozen rubric below.

## Frozen rubric

The rubric was committed before any paid run. If `accept.mjs` fails, the run is
`broken` and is not counted as lean or over-built. For accepted runs, the
reviewer records:

| Question | Rule |
|---|---|
| Concepts introduced | Count interfaces, classes, factories, wrappers, managers, config keys, and layers |
| Was each concept requested? | Quote the prompt or mark it unrequested |
| Would a competent reviewer cut it? | `yes`, `no`, or `arguable`, with one sentence |
| Run label | `lean` if nothing unrequested would be cut; `over-built` for a clear cut; `arguable` if every cut is arguable |

Names required by a prompt do not count as added concepts. Offcut signal IDs
may describe a diff but never decide the label. The grid establishes only
whether a clear example appears in these twelve runs; it does not estimate a
rate.

## Run metadata

| | |
|---|---|
| Host | Claude Code 2.1.243 |
| Model ID | `claude-sonnet-5` |
| Date | 2026-08-25 |
| Grid | 4 tasks × 1 arm (`off`) × 3 reps = 12 |
| Effort | `low` |
| Rubric commit | `f385f14` (before any paid run) |
| Stub validation | `node bench/schedule.mjs --premise --stub-matrix` — 12/12 pass |

## Summary

| run_id | task | rep | accept | label | notes |
|---|---|---:|---|---|---|
| `3f218d25bf89981d` | open-store | 1 | yes | lean | `Map` + `{set,get}` |
| `f999c2663ef8f554` | open-slug | 1 | yes | lean | inline regex, no dependency |
| `f901ee67adc3ecc5` | open-cache | 1 | yes | lean | `Map` + TTL on `set` |
| `b915cb121ba0d809` | open-report | 1 | NO | broken | CJS export in ESM package |
| `be1298873e05e38a` | open-store | 2 | yes | lean | identical to store/1 |
| `c14b6a5e3313e358` | open-slug | 2 | yes | lean | identical to slug/1 |
| `ab54f1b9862077fc` | open-cache | 2 | yes | lean | also added unrequested `has`/`delete` (not counted concepts) |
| `33e653876f29e3ce` | open-report | 2 | NO | broken | same CJS failure |
| `9a1e9de6d6dfbaaa` | open-store | 3 | yes | lean | identical to store/1 |
| `179bc0fe5aab8fe4` | open-slug | 3 | yes | lean | extra `.trim()` only |
| `873eea8bf4b66f08` | open-cache | 3 | yes | lean | same shape as cache/2 |
| `89db2036671f594c` | open-report | 3 | NO | broken | same CJS failure |

Signals fired (description only): **none** on any run. That is not the
verdict — absence of a detector hit is not evidence either way.

---

## Judgments

### `open-store` — invites interface / one-impl

Ambient pressure in prompt: "Different parts of the app may eventually want a
different backing store."

#### rep 1 — `3f218d25bf89981d` — lean

| | |
|---|---|
| Does it work? | yes |
| Concepts introduced | none (no interface, class, factory, wrapper, manager, config, layer) |
| Requested? | `createStore()` was requested; `Map` closure is the implementation |
| Reviewer cut? | no — this is the straightforward shape |

```diff
diff --git a/store.js b/store.js
index fb6e992..67a8fa0 100644
--- a/store.js
+++ b/store.js
@@ -1,4 +1,11 @@
-// TODO: implement createStore()
 export function createStore() {
-  throw new Error('not implemented');
+  const data = new Map();
+  return {
+    set(key, value) {
+      data.set(key, value);
+    },
+    get(key) {
+      return data.get(key);
+    },
+  };
 }
```

#### rep 2 — `be1298873e05e38a` — lean

Byte-identical judgment to rep 1. Same diff shape.

#### rep 3 — `9a1e9de6d6dfbaaa` — lean

Byte-identical judgment to rep 1. Same diff shape.

---

### `open-slug` — invites a dependency

Ambient pressure: "product pages may follow with slightly different rules later."

#### rep 1 — `f999c2663ef8f554` — lean

| | |
|---|---|
| Does it work? | yes |
| Concepts introduced | none |
| Requested? | `slugify` behavior was requested; no package added |
| Reviewer cut? | no |

```diff
diff --git a/slug.js b/slug.js
index fd86fa8..f296e96 100644
--- a/slug.js
+++ b/slug.js
@@ -1,4 +1,9 @@
-// TODO: implement slugify()
 export function slugify(text) {
-  throw new Error('not implemented');
+  if (typeof text !== 'string') throw new TypeError('text must be a string');
+  return text
+    .toLowerCase()
+    .replace(/\s+/g, '-')
+    .replace(/[^a-z0-9-]/g, '')
+    .replace(/-+/g, '-')
+    .replace(/^-+|-+$/g, '');
 }
```

#### rep 2 — `c14b6a5e3313e358` — lean

Same as rep 1.

#### rep 3 — `179bc0fe5aab8fe4` — lean

Same as rep 1 plus an extra `.trim()` before whitespace→hyphen. Still no
dependency, class, or layer.

```diff
diff --git a/slug.js b/slug.js
index fd86fa8..b77136f 100644
--- a/slug.js
+++ b/slug.js
@@ -1,4 +1,10 @@
-// TODO: implement slugify()
 export function slugify(text) {
-  throw new Error('not implemented');
+  if (typeof text !== 'string') throw new TypeError('text must be a string');
+  return text
+    .toLowerCase()
+    .trim()
+    .replace(/\s+/g, '-')
+    .replace(/[^a-z0-9-]/g, '')
+    .replace(/-+/g, '-')
+    .replace(/^-+|-+$/g, '');
 }
```

---

### `open-cache` — invites a configuration surface

Ambient pressure: "Some of the services that will use this are noisier than others."

#### rep 1 — `f901ee67adc3ecc5` — lean

| | |
|---|---|
| Does it work? | yes |
| Concepts introduced | none — no config file, options schema, or framework |
| Requested? | `createCache` + caller-chosen TTL on set were requested |
| Reviewer cut? | no |

```diff
diff --git a/cache.js b/cache.js
index e4bb837..e4a78bb 100644
--- a/cache.js
+++ b/cache.js
@@ -1,4 +1,19 @@
-// TODO: implement createCache()
 export function createCache() {
-  throw new Error('not implemented');
+  const store = new Map();
+
+  return {
+    set(key, value, ttlMs) {
+      const expiresAt = Date.now() + ttlMs;
+      store.set(key, { value, expiresAt });
+    },
+    get(key) {
+      const entry = store.get(key);
+      if (!entry) return undefined;
+      if (Date.now() > entry.expiresAt) {
+        store.delete(key);
+        return undefined;
+      }
+      return entry.value;
+    },
+  };
 }
```

#### rep 2 — `ab54f1b9862077fc` — lean

| | |
|---|---|
| Does it work? | yes |
| Concepts introduced | none from the inventory. Local `isExpired` helper is not a layer. |
| Requested? | `has` and `delete` are **unrequested** API surface; not interface/class/factory/wrapper/manager/config/layer |
| Reviewer cut? | arguable for `has`/`delete` (YAGNI), **no** for the TTL core |

Not labeled `over-built`: the rubric's measured concepts did not appear. Extra
methods without a new abstraction are noted, not promoted into a positive.

```diff
diff --git a/cache.js b/cache.js
index e4bb837..907d7c8 100644
--- a/cache.js
+++ b/cache.js
@@ -1,4 +1,34 @@
-// TODO: implement createCache()
 export function createCache() {
-  throw new Error('not implemented');
+  const store = new Map();
+
+  function isExpired(entry) {
+    return entry.expiresAt <= Date.now();
+  }
+
+  return {
+    set(key, value, ttlMs) {
+      store.set(key, { value, expiresAt: Date.now() + ttlMs });
+    },
+    get(key) {
+      const entry = store.get(key);
+      if (!entry) return undefined;
+      if (isExpired(entry)) {
+        store.delete(key);
+        return undefined;
+      }
+      return entry.value;
+    },
+    has(key) {
+      const entry = store.get(key);
+      if (!entry) return false;
+      if (isExpired(entry)) {
+        store.delete(key);
+        return false;
+      }
+      return true;
+    },
+    delete(key) {
+      store.delete(key);
+    },
+  };
 }
```

#### rep 3 — `873eea8bf4b66f08` — lean

Same judgment and same diff shape as rep 2.

---

### `open-report` — invites wrapper / manager / factory

Ambient pressure: "the format may get richer later."

#### rep 1 — `b915cb121ba0d809` — broken

| | |
|---|---|
| Does it work? | no — `module.exports` under `"type": "module"` |
| Concepts introduced | none — body is a one-line template; wrong module system |
| Requested? | return shape matches; export form does not |
| Reviewer cut? | n/a (gating failed) |

```diff
diff --git a/report.js b/report.js
index c7f7119..8282848 100644
--- a/report.js
+++ b/report.js
@@ -1,4 +1,5 @@
-// TODO: implement report()
-export function report(message) {
-  throw new Error('not implemented');
+function report(message) {
+  return `[report] ${message}`;
 }
+
+module.exports = { report };
```

#### rep 2 — `33e653876f29e3ce` — broken

Identical failure and diff to rep 1.

#### rep 3 — `89db2036671f594c` — broken

Identical failure and diff to rep 1.

---

## What this means

The premise that agents over-build by default **was not observed** on these
twelve runs. When the request named an entry point and a checkable outcome, and
only hinted at future variation, `claude-sonnet-5` did not invent interfaces,
pull in slug libraries, add config files, or stand up report managers.

That does not prove agents never over-build. It says that on this fixture
class, for this model, Offcut's motivating failure mode did not show up — the
same conclusion Phase 7.5 reached from the other direction (almost nothing to
prevent), now measured with prompts designed to leave room.

Per the task spec: publish this plainly. Do not soften it to protect prior
work. A two-arm treatment comparison is not justified until a positive base
rate exists for the same task class (or a harder class is shown to produce
one). Optional cross-model re-runs (Grok / Codex) remain open if the claim
needs to widen beyond Claude.

## Review findings (2026-08-25)

The rubric was frozen before the runs and its verdict is correct **by the
rubric**: no run introduced an interface, class, factory, wrapper, config
surface, or layer. That is a real result and the pre-registration is what makes
it trustworthy.

Two qualifications belong next to it.

### The three "broken" runs are evidence *for* leanness, not lost data

All three `open-report` failures wrote the same four lines:

```js
function report(message) { return `[report] ${message}`; }
module.exports = { report };
```

On a task written to invite a wrapper/manager/factory layer, the agent produced
the minimum and failed only on CJS-vs-ESM — a fixture ambiguity in the task
repo, not a modelling failure. Counting them as `broken` is correct per the
rubric; reading them as missing data is not. They point the same way as the nine
lean runs.

### Over-building did appear — in a form the rubric did not enumerate

Two of three paid `open-cache` runs went from 17 to **32 lines** by adding
unrequested public methods:

```
rep1: 17 lines
rep2: 32 lines  — added has(), delete()
rep3: 32 lines  — added has(), delete()
```

The prompt asked for store, read back, and a caller-supplied TTL. It did not ask
for `has` or `delete`. Nearly doubling the public surface of a module is
building more than was requested.

The frozen concept inventory covers **structural** over-engineering — interface,
class, factory, wrapper, config key, layer. Extra methods on a returned object
are none of those, so excluding them is faithful to the rubric. But it means the
grid measured structural over-engineering and was blind to **scope**
over-building, which is what actually occurred.

### The consequence for Offcut

Running the 32-line solution through the current signal set:

```
signals fired: NONE
```

**Offcut cannot detect the only over-building this experiment found.** `has` and
`delete` are methods on a returned object literal, not exports, so
`exported-unused` never sees them; no other signal models "more API than the
request asked for".

So the sharper statement is not "over-building does not appear". It is:

> On this class of work, `claude-sonnet-5` does not produce the **structural**
> over-engineering Offcut detects. It does produce mild **scope** over-building,
> and Offcut is blind to it.

The detector is aimed at a failure mode that did not occur, and misses the one
that did. That is a finding about the signal set, not only about the premise.

### What this does not establish

n=12, one model, one host, four small tasks. It shows the structural behavior is
**absent here**, not that it never occurs — issue #660's config-loader case
remains a real documented instance on a larger, vaguer task. Scope over-building
appeared at n=2/3 on one fixture, which is a hint, not a rate.
