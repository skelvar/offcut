#!/usr/bin/env node
import { acceptanceRoot } from '../../efficacy-fixture-lib.mjs';
import { acceptToolbar } from '../../live-toolbar-accept.mjs';

const root = acceptanceRoot();
acceptToolbar(root);
process.stdout.write('ACCEPT_OK\n');
