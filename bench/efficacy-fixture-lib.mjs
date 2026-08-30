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
      const newline = current.includes('\r\n') ? '\r\n' : '\n';
      const adaptNewlines = (value) => String(value ?? '').replace(/\r?\n/g, newline);
      const oldString = adaptNewlines(input.old_string);
      if (!oldString || !current.includes(oldString)) fail(`edit text missing in ${input.file_path}`);
      fs.writeFileSync(target, current.replace(oldString, adaptNewlines(input.new_string)), 'utf8');
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
export function stripCommentsAndStrings(text) {
  let output = '';
  let mode = 'code';
  let escaped = false;
  const source = String(text);
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (mode === 'line') {
      if (char === '\n') { mode = 'code'; output += '\n'; } else output += ' ';
    } else if (mode === 'block') {
      if (char === '*' && next === '/') { output += '  '; index += 1; mode = 'code'; }
      else output += char === '\n' ? '\n' : ' ';
    } else if (mode !== 'code') {
      output += char === '\n' ? '\n' : ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (
        (mode === 'single' && char === "'") ||
        (mode === 'double' && char === '"') ||
        (mode === 'template' && char === '`')
      ) mode = 'code';
    } else if (char === '/' && next === '/') {
      output += '  '; index += 1; mode = 'line';
    } else if (char === '/' && next === '*') {
      output += '  '; index += 1; mode = 'block';
    } else if (char === "'" || char === '"' || char === '`') {
      output += ' ';
      mode = char === "'" ? 'single' : char === '"' ? 'double' : 'template';
    } else output += char;
  }
  return output;
}
function diffSections(diff) {
  return String(diff).split(/^diff --git /m).slice(1).map((section) => {
    const header = section.match(/^a\/(.+?) b\/(.+)$/m);
    return {
      path: header?.[2] ?? '',
      newFile: /^new file mode /m.test(section) || /^--- \/dev\/null$/m.test(section),
      lines: section.split(/\r?\n/),
    };
  });
}
export function detectNewDependency(diff) {
  const dependencyBlocks = new Set(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']);
  for (const file of diffSections(diff).filter((entry) => path.posix.basename(entry.path) === 'package.json')) {
    let block = null;
    let depth = 0;
    for (const raw of file.lines) {
      if (!(raw.startsWith('+') || raw.startsWith(' ')) || raw.startsWith('+++')) continue;
      const line = raw.slice(1);
      const opened = line.match(/"(dependencies|devDependencies|optionalDependencies|peerDependencies)"\s*:\s*\{/);
      if (opened && dependencyBlocks.has(opened[1])) {
        block = opened[1];
        depth = 1;
        const rest = line.slice((opened.index ?? 0) + opened[0].length);
        if (raw.startsWith('+') && /"[^"]+"\s*:\s*"[^"]+"/.test(rest)) return true;
        continue;
      }
      if (!block) continue;
      if (raw.startsWith('+') && /^\s*"[^"]+"\s*:\s*"[^"]+"/.test(line)) return true;
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (depth <= 0) block = null;
    }
  }
  return false;
}
export function detectSpeculativeAbstraction(diff) {
  const code = stripCommentsAndStrings(addedDiffText(diff));
  const contracts = [
    ...code.matchAll(/\binterface\s+([A-Za-z_$][\w$]*)/g),
    ...code.matchAll(/\babstract\s+class\s+([A-Za-z_$][\w$]*)/g),
  ].map((match) => match[1]);
  return contracts.some((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...code.matchAll(new RegExp(`\\bclass\\s+[A-Za-z_$][\\w$]*[^\\n{]*\\b(?:implements|extends)\\s+${escaped}\\b`, 'g'))].length === 1;
  });
}
export function detectNewConfigSurface(diff) {
  const code = stripCommentsAndStrings(addedDiffText(diff));
  return /\b(?:config\.get|getConfig|defineConfig|Convict|ConvictSchema|nconf|cosmiconfig)\b|\brc\s*\(/.test(code);
}
export function detectUnusedDefaultParam(diff) {
  const code = stripCommentsAndStrings(addedDiffText(diff));
  const declarations = code.matchAll(
    /(?:function\s+[A-Za-z_$][\w$]*|(?:const|let)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?)\s*\(([^)]*)\)/g,
  );
  for (const declaration of declarations) {
    for (const match of declaration[1].matchAll(/([A-Za-z_$][\w$]*)\s*=\s*[^,)]*/g)) {
      const name = match[1];
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if ([...code.matchAll(new RegExp(`\\b${escaped}\\b`, 'g'))].length === 1) return true;
    }
  }
  return false;
}
export function detectLargeFirstWrite(diff) {
  const implementation = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
  return diffSections(diff).some((file) => {
    if (!file.newFile || !implementation.has(path.posix.extname(file.path))) return false;
    const added = file.lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1));
    const substantive = stripCommentsAndStrings(added.join('\n')).split('\n').filter((line) => line.trim());
    return added.length > 80 && substantive.length > 80;
  });
}
export function printMeasure(targetPresent, inputs, evidence) {
  const result = { target_present: Boolean(targetPresent), seen: { inputs, evidence } };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
