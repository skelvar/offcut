import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
function fail(message) { throw new Error(message); }
function oneDirectoryArg(argv, label) {
  if (argv.length !== 3 || !argv[2]) fail(`${label} requires exactly one directory path`);
  const root = path.resolve(argv[2]);
  let stat;
  try { stat = fs.lstatSync(root); } catch { fail(`${label} path does not exist`); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} path must be a real directory`);
  return root;
}
function inside(root, relative) {
  if (!relative || path.isAbsolute(relative)) fail('relative file path required');
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`)) fail(`file path escapes root: ${relative}`);
  return target;
}
export function acceptanceRoot(argv = process.argv) {
  return oneDirectoryArg(argv, 'accept');
}
export function runModuleProbe(root, relative, body) {
  const file = inside(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`missing ${relative}`);
  const source = `import * as subject from ${JSON.stringify(pathToFileURL(file).href)};\n${body}`;
  const args = [];
  if (path.extname(file) === '.ts') args.push('--experimental-strip-types');
  args.push('--input-type=module', '-e', source);
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 10_000 });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail((result.stderr || result.stdout || `probe exited ${result.status}`).trim());
}
export function applyStub(argv, operations) {
  const root = oneDirectoryArg(argv, 'stub');
  if (!Array.isArray(operations) || operations.length === 0) fail('stub operations required');
  for (const operation of operations) {
    const input = operation?.tool_input;
    const target = inside(root, input?.file_path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (operation.tool_name === 'Write') {
      fs.writeFileSync(target, String(input.content ?? ''), 'utf8');
      continue;
    }
    if (operation.tool_name === 'Edit') {
      if (!fs.existsSync(target)) fail(`cannot edit missing ${input.file_path}`);
      const current = fs.readFileSync(target, 'utf8');
      const oldString = String(input.old_string ?? '');
      if (!oldString || !current.includes(oldString)) fail(`edit text missing in ${input.file_path}`);
      fs.writeFileSync(target, current.replace(oldString, String(input.new_string ?? '')), 'utf8');
      continue;
    }
    fail(`unsupported operation: ${operation.tool_name}`);
  }
  process.stdout.write(`${JSON.stringify({ operations })}\n`);
}
export function readMeasureInput(argv = process.argv) {
  const root = oneDirectoryArg(argv, 'measure');
  const inputs = fs.readdirSync(root).sort();
  const expected = ['accept.json', 'diff.patch', 'work'];
  if (JSON.stringify(inputs) !== JSON.stringify(expected)) fail(`measure input contract mismatch: ${inputs.join(',')}`);
  const diffPath = inside(root, 'diff.patch');
  const acceptPath = inside(root, 'accept.json');
  const work = inside(root, 'work');
  if (!fs.statSync(diffPath).isFile() || !fs.statSync(acceptPath).isFile()) fail('measure files must be regular files');
  if (!fs.statSync(work).isDirectory()) fail('measure work must be a directory');
  const accept = JSON.parse(fs.readFileSync(acceptPath, 'utf8'));
  if (typeof accept.ok !== 'boolean') fail('accept.json missing boolean ok');
  return { diff: fs.readFileSync(diffPath, 'utf8'), work, accept, inputs };
}
export function addedDiffText(diff) {
  const added = String(diff).split(/\r?\n/).filter((line) => line.startsWith('+') && !line.startsWith('+++'));
  return added.map((line) => line.slice(1)).join('\n');
}
export function printMeasure(targetPresent, inputs, evidence) {
  const result = { target_present: Boolean(targetPresent), seen: { inputs, evidence } };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
