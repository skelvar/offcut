#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/asset-url.js', "const previous = process.env.ASSET_BASE_URL;\ntry {\n  delete process.env.ASSET_BASE_URL;\n  if (subject.assetUrl('/icons/a.svg') !== '/assets/icons/a.svg') throw new Error('default');\n  const base = 'https://cdn.example/' + (process.pid % 37) + '///';\n  process.env.ASSET_BASE_URL = base;\n  if (subject.assetUrl('img.png') !== base.replace(/\\/+$/, '') + '/img.png') throw new Error('environment');\n  process.env.ASSET_BASE_URL = '/next/';\n  if (subject.assetUrl('') !== '/next') throw new Error('read per call');\n} finally { if (previous === undefined) delete process.env.ASSET_BASE_URL; else process.env.ASSET_BASE_URL = previous; }");
process.stdout.write('ACCEPT_OK\n');
