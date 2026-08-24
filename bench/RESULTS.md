# Phase 7.5 results

Re-benchmark against the corrected detector. Phase 5 numbers measured a
broken signal set and are archived in `bench/RESULTS-phase5.md` — not evidence
about the current build.

Every run is listed. Failed acceptance checks are excluded from size
medians and reported separately.

## Run metadata

- Host versions: 2.1.241 (Claude Code)
- Model IDs: claude-sonnet-5
- Dates: 2026-08-24
- Total runs: 80
- Controls: config-fallback, retry-backoff, ttl-cache, shared-validate
- Invite tasks: one-impl-store, slug-ascii, id-hex, greet-opts

## Prompt integrity

- **config-fallback**: identical prompt sha256 across arms (`7b697d0e77188dad99f028e65876e37bbcc8b541f9762e4d58fa9651d275d789`); arms=off,full
- **greet-opts**: identical prompt sha256 across arms (`25ab01c0652748098c47254b97171b8fc1283b65a8c6125a0f778260225c4885`); arms=off,full
- **id-hex**: identical prompt sha256 across arms (`86e6af4ca8bf5f3247fbfa3b0d8668878e91774967bb310586cea3286f173c77`); arms=off,full
- **one-impl-store**: identical prompt sha256 across arms (`4bf0fe3655a2f1bf9254693f8beff1a5568e1d09748f7854e947db47d617c2c3`); arms=off,full
- **retry-backoff**: identical prompt sha256 across arms (`b84d8984861fe8f8555cfc15a6689f9ce832f838c45d9f345bba495650799a92`); arms=off,full
- **shared-validate**: identical prompt sha256 across arms (`c50b4734722d7839efa581c951b8c2b87cdb65bf807e8be51d01f3fb818f425b`); arms=off,full
- **slug-ascii**: identical prompt sha256 across arms (`3d26876104b5c782d65742176598750ab2440403b4aea4e3b1bf861624e1738e`); arms=off,full
- **ttl-cache**: identical prompt sha256 across arms (`8e3f4b990901c173bb260b14adba0ca7d1bffbf25b24c1dd166ab33313a47c7e`); arms=off,full

## All runs

| run_id | task | arm | rep | passed | sig_fired | survived | files+ | deps+ | exp_unused | abstr | cfg+ | +lines | -lines | model |
|---|---|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 53109179bfdb284a | config-fallback | full | 1 | yes | — | n/a | 0 | 0 | 1 | 0 | 0 | 16 | 4 | claude-sonnet-5 |
| 364f8ddd23beb940 | config-fallback | off | 1 | yes | — | n/a | 0 | 0 | 1 | 0 | 0 | 17 | 4 | claude-sonnet-5 |
| 09516c188b408235 | config-fallback | full | 2 | yes | — | n/a | 0 | 0 | 1 | 0 | 0 | 17 | 4 | claude-sonnet-5 |
| 14ee133837d93b0d | config-fallback | off | 2 | yes | — | n/a | 0 | 0 | 1 | 0 | 0 | 17 | 4 | claude-sonnet-5 |
| e88b3bb7f3e939e5 | config-fallback | full | 3 | yes | — | n/a | 0 | 0 | 1 | 0 | 0 | 17 | 4 | claude-sonnet-5 |
| e8dbb23c861b7728 | config-fallback | off | 3 | yes | — | n/a | 0 | 0 | 1 | 0 | 0 | 17 | 4 | claude-sonnet-5 |
| 783285df25f46d9e | config-fallback | full | 4 | yes | — | n/a | 0 | 0 | 1 | 0 | 0 | 17 | 4 | claude-sonnet-5 |
| 583c29cac81dabdc | config-fallback | off | 4 | yes | — | n/a | 0 | 0 | 1 | 0 | 0 | 16 | 4 | claude-sonnet-5 |
| 1c0491a9643612c7 | config-fallback | full | 5 | yes | — | n/a | 0 | 0 | 1 | 0 | 0 | 17 | 4 | claude-sonnet-5 |
| cbf6fed83461ef69 | config-fallback | off | 5 | yes | — | n/a | 0 | 0 | 1 | 0 | 0 | 17 | 4 | claude-sonnet-5 |
| e786ded42f7cb3fc | greet-opts | full | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 3 | claude-sonnet-5 |
| da0bc90787dd088d | greet-opts | off | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 2 | 3 | claude-sonnet-5 |
| 5c8beed6e7d9324e | greet-opts | full | 2 | NO | — | n/a | 0 | 0 | 0 | 0 | 0 | 5 | 3 | claude-sonnet-5 |
| c5108094cd219468 | greet-opts | off | 2 | NO | — | n/a | 0 | 0 | 0 | 0 | 0 | 5 | 3 | claude-sonnet-5 |
| 846fb115d78c6e77 | greet-opts | full | 3 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 3 | claude-sonnet-5 |
| bbe45bdc619065ad | greet-opts | off | 3 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 3 | claude-sonnet-5 |
| af3c764b6d19626b | greet-opts | full | 4 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 3 | claude-sonnet-5 |
| 320ecffb329fcbe9 | greet-opts | off | 4 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 3 | claude-sonnet-5 |
| 7ecd15232727d9fc | greet-opts | full | 5 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 3 | claude-sonnet-5 |
| d149113eccdaeca4 | greet-opts | off | 5 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 3 | claude-sonnet-5 |
| 61c2c48263401b1b | id-hex | full | 1 | yes | single-call-wrapper | yes (single-call-wrapper) | 0 | 0 | 0 | 0 | 0 | 3 | 2 | claude-sonnet-5 |
| 382d48eb9f8334a5 | id-hex | off | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 2 | claude-sonnet-5 |
| 3d3e828139afc884 | id-hex | full | 2 | yes | single-call-wrapper | yes (single-call-wrapper) | 0 | 0 | 0 | 0 | 0 | 3 | 2 | claude-sonnet-5 |
| a99d3fd1d5ff9587 | id-hex | off | 2 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 2 | claude-sonnet-5 |
| a9d681939fa94e23 | id-hex | full | 3 | yes | single-call-wrapper | yes (single-call-wrapper) | 0 | 0 | 0 | 0 | 0 | 3 | 2 | claude-sonnet-5 |
| 1b1e27fb91514dc6 | id-hex | off | 3 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 2 | claude-sonnet-5 |
| 76ab6f6c5c7a93b0 | id-hex | full | 4 | yes | single-call-wrapper | yes (single-call-wrapper) | 0 | 0 | 0 | 0 | 0 | 3 | 2 | claude-sonnet-5 |
| 01d9180a50265f95 | id-hex | off | 4 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 2 | claude-sonnet-5 |
| 8caa4503f39a72f7 | id-hex | full | 5 | NO | single-call-wrapper | yes (single-call-wrapper) | 0 | 0 | 0 | 0 | 0 | 6 | 3 | claude-sonnet-5 |
| 87dff431be7678fd | id-hex | off | 5 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 3 | 2 | claude-sonnet-5 |
| 6f3008a47a1db930 | one-impl-store | full | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 10 | 6 | claude-sonnet-5 |
| 5e6b91dec7e3249e | one-impl-store | off | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 10 | 6 | claude-sonnet-5 |
| 89ec5786e64ff8f1 | one-impl-store | full | 2 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 9 | 2 | claude-sonnet-5 |
| 4d48681cd1b5cf3d | one-impl-store | off | 2 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 9 | 2 | claude-sonnet-5 |
| 7bd5d42ea216ccad | one-impl-store | full | 3 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 9 | 2 | claude-sonnet-5 |
| e66569718b053c91 | one-impl-store | off | 3 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 5 | 2 | claude-sonnet-5 |
| 5eafb43d13811d64 | one-impl-store | full | 4 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 5 | 2 | claude-sonnet-5 |
| 2a0faf3ce23002e1 | one-impl-store | off | 4 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 5 | 2 | claude-sonnet-5 |
| 0aed81fa5be5e9ff | one-impl-store | full | 5 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 5 | 2 | claude-sonnet-5 |
| 298ddbfff28667c7 | one-impl-store | off | 5 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 9 | 2 | claude-sonnet-5 |
| cca9e2427fdc4625 | retry-backoff | full | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 10 | 4 | claude-sonnet-5 |
| 060abba1ab2fdc37 | retry-backoff | off | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 10 | 4 | claude-sonnet-5 |
| bd078c99ec033641 | retry-backoff | full | 2 | NO | — | n/a | 0 | 0 | 0 | 0 | 0 | 19 | 4 | claude-sonnet-5 |
| 6b63c0e7f76c17b5 | retry-backoff | off | 2 | NO | — | n/a | 0 | 0 | 0 | 0 | 0 | 12 | 4 | claude-sonnet-5 |
| ea7b0a422c8f1a80 | retry-backoff | full | 3 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 13 | 4 | claude-sonnet-5 |
| eec33b1e202d987b | retry-backoff | off | 3 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 10 | 4 | claude-sonnet-5 |
| 67d25e6eeb7249bc | retry-backoff | full | 4 | NO | — | n/a | 0 | 0 | 0 | 0 | 0 | 20 | 4 | claude-sonnet-5 |
| 728e485998750c1a | retry-backoff | off | 4 | NO | — | n/a | 0 | 0 | 0 | 0 | 0 | 18 | 4 | claude-sonnet-5 |
| 7511cd68f8f41646 | retry-backoff | full | 5 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 19 | 4 | claude-sonnet-5 |
| aba0dc74ea2f0337 | retry-backoff | off | 5 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 12 | 4 | claude-sonnet-5 |
| bd9d2c01e7dcf675 | shared-validate | full | 1 | yes | — | n/a | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| d673e7e1d580d25c | shared-validate | off | 1 | yes | — | n/a | 1 | 0 | 2 | 0 | 0 | 19 | 8 | claude-sonnet-5 |
| 77e13afd753c8a68 | shared-validate | full | 2 | yes | — | n/a | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| 9c46cda53654d3e9 | shared-validate | off | 2 | yes | — | n/a | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| d16b28fe8a7fab5a | shared-validate | full | 3 | yes | — | n/a | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| 65e1a47386c004fd | shared-validate | off | 3 | yes | — | n/a | 1 | 0 | 2 | 0 | 0 | 19 | 8 | claude-sonnet-5 |
| cf6d842aa641c11d | shared-validate | full | 4 | yes | — | n/a | 1 | 0 | 2 | 0 | 0 | 19 | 8 | claude-sonnet-5 |
| 7561bf74ca620d4b | shared-validate | off | 4 | yes | — | n/a | 1 | 0 | 2 | 0 | 0 | 19 | 8 | claude-sonnet-5 |
| 42a69ee57adbb11b | shared-validate | full | 5 | yes | — | n/a | 1 | 0 | 2 | 0 | 0 | 19 | 8 | claude-sonnet-5 |
| b205ff27c8fec773 | shared-validate | off | 5 | yes | — | n/a | 1 | 0 | 2 | 0 | 0 | 19 | 8 | claude-sonnet-5 |
| a895385ddc4fd2f9 | slug-ascii | full | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 8 | 3 | claude-sonnet-5 |
| 090b1cff1c5ca956 | slug-ascii | off | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 8 | 3 | claude-sonnet-5 |
| 97fd5df11c8fd660 | slug-ascii | full | 2 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 10 | 3 | claude-sonnet-5 |
| c7baa5fa83e82152 | slug-ascii | off | 2 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 8 | 3 | claude-sonnet-5 |
| 5379637dc13baf55 | slug-ascii | full | 3 | NO | — | n/a | 0 | 0 | 0 | 0 | 0 | 10 | 3 | claude-sonnet-5 |
| d659acfcd0ec1433 | slug-ascii | off | 3 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 8 | 3 | claude-sonnet-5 |
| c2351906f80aee0e | slug-ascii | full | 4 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 8 | 3 | claude-sonnet-5 |
| c2112d93569aaa57 | slug-ascii | off | 4 | NO | — | n/a | 0 | 0 | 0 | 0 | 0 | 11 | 3 | claude-sonnet-5 |
| 8a298a2f50ef0835 | slug-ascii | full | 5 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 8 | 3 | claude-sonnet-5 |
| cf0912c7b1e6ba65 | slug-ascii | off | 5 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 8 | 3 | claude-sonnet-5 |
| 3e8277b0697e83cb | ttl-cache | full | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 26 | 4 | claude-sonnet-5 |
| 2bc51ce5f2165901 | ttl-cache | off | 1 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 26 | 4 | claude-sonnet-5 |
| d22a51754b841d88 | ttl-cache | full | 2 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 25 | 4 | claude-sonnet-5 |
| f35506c8b5727f77 | ttl-cache | off | 2 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 24 | 4 | claude-sonnet-5 |
| cf3ea413b799843b | ttl-cache | full | 3 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 26 | 4 | claude-sonnet-5 |
| 36bc1d5fb72a23d3 | ttl-cache | off | 3 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 26 | 4 | claude-sonnet-5 |
| 1337f68de967939a | ttl-cache | full | 4 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 26 | 4 | claude-sonnet-5 |
| 01733d874b85e2b3 | ttl-cache | off | 4 | NO | — | n/a | 0 | 0 | 0 | 0 | 0 | 26 | 4 | claude-sonnet-5 |
| 4d64acf81b08e262 | ttl-cache | full | 5 | yes | unused-default-param | no | 0 | 0 | 0 | 0 | 0 | 32 | 4 | claude-sonnet-5 |
| 8000137bf6dcb349 | ttl-cache | off | 5 | yes | — | n/a | 0 | 0 | 0 | 0 | 0 | 34 | 4 | claude-sonnet-5 |

## Failures (excluded from size comparison)

- `bd078c99ec033641` task=retry-backoff arm=full rep=2: file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-2XLwbY/repo/retry.js:19
module.exports = { retry };
^

ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '\\?\C:\Users\bash\AppData\Local\Temp\offcut-bench-work-2XLwbY\repo\package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-2XLwbY/repo/retry.js:19:1
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:633:26
    at async file:///D:/rightseam/bench/tasks/retry-backoff/accept.mjs:15:19

Node.js v24.16.0
- `6b63c0e7f76c17b5` task=retry-backoff arm=off rep=2: file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-rbcnuG/repo/retry.js:12
module.exports = { retry };
^

ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '\\?\C:\Users\bash\AppData\Local\Temp\offcut-bench-work-rbcnuG\repo\package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-rbcnuG/repo/retry.js:12:1
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:633:26
    at async file:///D:/rightseam/bench/tasks/retry-backoff/accept.mjs:15:19

Node.js v24.16.0
- `5c8beed6e7d9324e` task=greet-opts arm=full rep=2: file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-zel1P0/repo/greet.js:6
module.exports = { formatGreeting };
^

ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '\\?\C:\Users\bash\AppData\Local\Temp\offcut-bench-work-zel1P0\repo\package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-zel1P0/repo/greet.js:6:1
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:633:26
    at async file:///D:/rightseam/bench/tasks/greet-opts/accept.mjs:16:28

Node.js v24.16.0
- `c5108094cd219468` task=greet-opts arm=off rep=2: file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-vZdFqJ/repo/greet.js:6
module.exports = { formatGreeting };
^

ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '\\?\C:\Users\bash\AppData\Local\Temp\offcut-bench-work-vZdFqJ\repo\package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-vZdFqJ/repo/greet.js:6:1
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:633:26
    at async file:///D:/rightseam/bench/tasks/greet-opts/accept.mjs:16:28

Node.js v24.16.0
- `5379637dc13baf55` task=slug-ascii arm=full rep=3: file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-075gBS/repo/slug.js:11
module.exports = slugify;
^

ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '\\?\C:\Users\bash\AppData\Local\Temp\offcut-bench-work-075gBS\repo\package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-075gBS/repo/slug.js:11:1
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:633:26
    at async file:///D:/rightseam/bench/tasks/slug-ascii/accept.mjs:16:21

Node.js v24.16.0
- `67d25e6eeb7249bc` task=retry-backoff arm=full rep=4: file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-txoDPF/repo/retry.js:19
module.exports = retry;
^

ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '\\?\C:\Users\bash\AppData\Local\Temp\offcut-bench-work-txoDPF\repo\package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-txoDPF/repo/retry.js:19:1
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:633:26
    at async file:///D:/rightseam/bench/tasks/retry-backoff/accept.mjs:15:19

Node.js v24.16.0
- `728e485998750c1a` task=retry-backoff arm=off rep=4: file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-TblK2w/repo/retry.js:18
module.exports = retry;
^

ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '\\?\C:\Users\bash\AppData\Local\Temp\offcut-bench-work-TblK2w\repo\package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-TblK2w/repo/retry.js:18:1
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:633:26
    at async file:///D:/rightseam/bench/tasks/retry-backoff/accept.mjs:15:19

Node.js v24.16.0
- `01733d874b85e2b3` task=ttl-cache arm=off rep=4: file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-41Mprp/repo/cache.js:26
module.exports = { createCache };
^

ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '\\?\C:\Users\bash\AppData\Local\Temp\offcut-bench-work-41Mprp\repo\package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-41Mprp/repo/cache.js:26:1
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:633:26
    at async file:///D:/rightseam/bench/tasks/ttl-cache/accept.mjs:16:25

Node.js v24.16.0
- `c2112d93569aaa57` task=slug-ascii arm=off rep=4: file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-TvF5LQ/repo/slug.js:11
module.exports = slugify;
^

ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and '\\?\C:\Users\bash\AppData\Local\Temp\offcut-bench-work-TvF5LQ\repo\package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-TvF5LQ/repo/slug.js:11:1
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:633:26
    at async file:///D:/rightseam/bench/tasks/slug-ascii/accept.mjs:16:21

Node.js v24.16.0
- `8caa4503f39a72f7` task=id-hex arm=full rep=5: file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-NJwezv/repo/id.js:1
const crypto = require('node:crypto');
               ^

ReferenceError: require is not defined in ES module scope, you can use import instead
This file is being treated as an ES module because it has a '.js' file extension and '\\?\C:\Users\bash\AppData\Local\Temp\offcut-bench-work-NJwezv\repo\package.json' contains "type": "module". To treat it as a CommonJS script, rename it to use the '.cjs' file extension.
    at file:///C:/Users/bash/AppData/Local/Temp/offcut-bench-work-NJwezv/repo/id.js:1:16
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:633:26
    at async file:///D:/rightseam/bench/tasks/id-hex/accept.mjs:16:24

Node.js v24.16.0

## Signals fired and pattern survival (product columns)

For each task/arm: how often hooks challenged, and whether the flagged pattern remained in the final diff.
`signals_in_diff` is a blind rescan of the final work (useful for stub runs where hooks do not execute).

### config-fallback (control)

**arm=off** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [1, 1, 1, 1, 1] median=1
- signals_in_diff union: exported-unused
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

**arm=full** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [1, 1, 1, 1, 1] median=1
- signals_in_diff union: exported-unused
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

### greet-opts (invite)

**arm=off** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [0, 0, 0, 0, 0] median=0
- signals_in_diff union: —
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

**arm=full** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [0, 0, 0, 0, 0] median=0
- signals_in_diff union: —
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

### id-hex (invite)

**arm=off** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [2, 2, 2, 2, 2] median=2
- signals_in_diff union: exported-unused, single-call-wrapper
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

**arm=full** n=5
- signals_fired_count: [1, 1, 1, 1, 1] median=1
- signals_fired union: single-call-wrapper
- signals_in_diff_count: [2, 2, 2, 2, 1] median=2
- signals_in_diff union: exported-unused, single-call-wrapper
- challenges with pattern still present: 5/5; cleared after challenge: 0/5

### one-impl-store (invite)

**arm=off** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [0, 0, 0, 0, 0] median=0
- signals_in_diff union: —
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

**arm=full** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [0, 0, 0, 0, 0] median=0
- signals_in_diff union: —
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

### retry-backoff (control)

**arm=off** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [0, 0, 0, 0, 0] median=0
- signals_in_diff union: —
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

**arm=full** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [0, 0, 0, 0, 0] median=0
- signals_in_diff union: —
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

### shared-validate (control)

**arm=off** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [1, 1, 1, 1, 1] median=1
- signals_in_diff union: exported-unused
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

**arm=full** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [1, 1, 1, 1, 1] median=1
- signals_in_diff union: exported-unused
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

### slug-ascii (invite)

**arm=off** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [0, 0, 0, 0, 0] median=0
- signals_in_diff union: —
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

**arm=full** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [0, 0, 0, 0, 0] median=0
- signals_in_diff union: —
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

### ttl-cache (control)

**arm=off** n=5
- signals_fired_count: [0, 0, 0, 0, 0] median=0
- signals_fired union: —
- signals_in_diff_count: [0, 0, 0, 0, 0] median=0
- signals_in_diff union: —
- challenges with pattern still present: 0/0; cleared after challenge: 0/0

**arm=full** n=5
- signals_fired_count: [0, 0, 0, 0, 1] median=0
- signals_fired union: unused-default-param
- signals_in_diff_count: [0, 0, 0, 0, 0] median=0
- signals_in_diff union: —
- challenges with pattern still present: 0/1; cleared after challenge: 1/1

## Size metrics (passed runs only) — medians and full distributions

### config-fallback

**arm=off** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [1, 1, 1, 1, 1] median=1
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [17, 17, 17, 16, 17] median=17
- lines_removed: [4, 4, 4, 4, 4] median=4

**arm=full** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [1, 1, 1, 1, 1] median=1
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [16, 17, 17, 17, 17] median=17
- lines_removed: [4, 4, 4, 4, 4] median=4

### greet-opts

**arm=off** passed=4 failed=1

- files_created: [0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0] median=0
- lines_added: [2, 3, 3, 3] median=3
- lines_removed: [3, 3, 3, 3] median=3

**arm=full** passed=4 failed=1

- files_created: [0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0] median=0
- lines_added: [3, 3, 3, 3] median=3
- lines_removed: [3, 3, 3, 3] median=3

### id-hex

**arm=off** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [3, 3, 3, 3, 3] median=3
- lines_removed: [2, 2, 2, 2, 2] median=2

**arm=full** passed=4 failed=1

- files_created: [0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0] median=0
- lines_added: [3, 3, 3, 3] median=3
- lines_removed: [2, 2, 2, 2] median=2

### one-impl-store

**arm=off** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [10, 9, 5, 5, 9] median=9
- lines_removed: [6, 2, 2, 2, 2] median=2

**arm=full** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [10, 9, 9, 5, 5] median=9
- lines_removed: [6, 2, 2, 2, 2] median=2

### retry-backoff

**arm=off** passed=3 failed=2

- files_created: [0, 0, 0] median=0
- dependencies_added: [0, 0, 0] median=0
- exported_unused: [0, 0, 0] median=0
- abstraction_layers: [0, 0, 0] median=0
- config_keys_added: [0, 0, 0] median=0
- lines_added: [10, 10, 12] median=10
- lines_removed: [4, 4, 4] median=4

**arm=full** passed=3 failed=2

- files_created: [0, 0, 0] median=0
- dependencies_added: [0, 0, 0] median=0
- exported_unused: [0, 0, 0] median=0
- abstraction_layers: [0, 0, 0] median=0
- config_keys_added: [0, 0, 0] median=0
- lines_added: [10, 13, 19] median=13
- lines_removed: [4, 4, 4] median=4

### shared-validate

**arm=off** passed=5 failed=0

- files_created: [1, 1, 1, 1, 1] median=1
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [2, 0, 2, 2, 2] median=2
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [19, 13, 19, 19, 19] median=19
- lines_removed: [8, 2, 8, 8, 8] median=8

**arm=full** passed=5 failed=0

- files_created: [1, 1, 1, 1, 1] median=1
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 2, 2] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [13, 13, 13, 19, 19] median=13
- lines_removed: [2, 2, 2, 8, 8] median=2

### slug-ascii

**arm=off** passed=4 failed=1

- files_created: [0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0] median=0
- lines_added: [8, 8, 8, 8] median=8
- lines_removed: [3, 3, 3, 3] median=3

**arm=full** passed=4 failed=1

- files_created: [0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0] median=0
- lines_added: [8, 10, 8, 8] median=8
- lines_removed: [3, 3, 3, 3] median=3

### ttl-cache

**arm=off** passed=4 failed=1

- files_created: [0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0] median=0
- lines_added: [26, 24, 26, 34] median=26
- lines_removed: [4, 4, 4, 4] median=4

**arm=full** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [26, 25, 26, 26, 32] median=26
- lines_removed: [4, 4, 4, 4, 4] median=4

## Aggregate (all tasks, passed runs)

**arm=off** n=35
- files_created: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- exported_unused: [1, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 1, 2, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- lines_added: [17, 10, 26, 19, 10, 8, 3, 2, 17, 24, 13, 9, 8, 3, 17, 10, 26, 19, 5, 8, 3, 3, 16, 19, 5, 3, 3, 17, 12, 34, 19, 9, 8, 3, 3] median=10
- lines_removed: [4, 4, 4, 8, 6, 3, 2, 3, 4, 4, 2, 2, 3, 2, 4, 4, 4, 8, 2, 3, 2, 3, 4, 8, 2, 2, 3, 4, 4, 4, 8, 2, 3, 2, 3] median=3

**arm=full** n=35
- files_created: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- exported_unused: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- lines_added: [16, 10, 26, 13, 10, 8, 3, 3, 17, 25, 13, 9, 10, 3, 17, 13, 26, 13, 9, 3, 3, 17, 26, 19, 5, 8, 3, 3, 17, 19, 32, 19, 5, 8, 3] median=10
- lines_removed: [4, 4, 4, 2, 6, 3, 2, 3, 4, 4, 2, 2, 3, 2, 4, 4, 4, 2, 2, 2, 3, 4, 4, 8, 2, 3, 2, 3, 4, 4, 4, 8, 2, 3, 3] median=3

## Conclusion

**Product answer: no — challenges fired and the flagged patterns still shipped.** Offcut detects over-engineering accurately enough to challenge and still does not prevent it. The honest product on this evidence is a review/audit tool, not a persistent mode that changes builds. No consistent size-metric shift across arms (or movements are within run-to-run noise). Challenges on passed full runs: 5; pattern survived 4; cleared 1. Detector discrimination on full arm: invite fire rate 24%, control fire rate 6%. Fail counts: off=5, full=5. files_created: off median=0, full median=0; lines_added: off median=10, full median=10; abstraction_layers: off median=0, full median=0; exported_unused: off median=0, full median=0. Five runs per cell is enough to notice a large effect and not enough to claim a small one.

## single-call-wrapper verdict

On id-hex (the conventional crypto.randomBytes→hex wrapper), single-call-wrapper appears in the final diff on 9/9 passed runs. Hooks challenged it on 4/4 full-arm runs. **Verdict: delete `single-call-wrapper`.** It fires on the accepted lean solution; the pattern is conventional, not a defect. No text-level tune separates keep-worthy helpers from inline-worthy ones.

## Findings (process)

- Real `~/.offcut/` can accumulate many `fired-*` / `turn-*` files; this bench always uses a fresh `OFFCUT_STATE_DIR` and never touches the real state dir. Pruning is owned by Phase 8 (`tasks/PHASE-8-TASK.md` §5).
- Phase 5 undercounted challenges by keeping only the first per phase in analysis; this report records the full fired set per run as a column.
