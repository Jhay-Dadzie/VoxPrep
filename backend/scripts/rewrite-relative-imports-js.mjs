import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_ROOTS = ['src'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const EXISTING_SPECIFIER_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.json',
  '.node',
  '.css',
]);
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const roots = args.filter((arg) => !arg.startsWith('-'));
const targetRoots = roots.length > 0 ? roots : DEFAULT_ROOTS;

const changedFiles = [];

for (const root of targetRoots) {
  await visit(path.resolve(root));
}

if (changedFiles.length > 0) {
  const action = checkOnly ? 'Need changes' : 'Updated';
  console.log(`${action}:`);
  for (const file of changedFiles) {
    console.log(`- ${path.relative(process.cwd(), file)}`);
  }
}

if (checkOnly && changedFiles.length > 0) {
  process.exitCode = 1;
}

async function visit(filePath) {
  let entries;

  try {
    entries = await readdir(filePath, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOTDIR') {
      await rewriteFile(filePath);
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    await visit(path.join(filePath, entry.name));
  }
}

async function rewriteFile(filePath) {
  if (!SOURCE_EXTENSIONS.has(path.extname(filePath))) {
    return;
  }

  const source = await readFile(filePath, 'utf8');
  const output = rewriteSource(source);

  if (output === source) {
    return;
  }

  changedFiles.push(filePath);

  if (!checkOnly) {
    await writeFile(filePath, output);
  }
}

function rewriteSource(source) {
  let output = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index + 2);
      const commentEnd = end === -1 ? source.length : end;
      output += source.slice(index, commentEnd);
      index = commentEnd;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const commentEnd = end === -1 ? source.length : end + 2;
      output += source.slice(index, commentEnd);
      index = commentEnd;
      continue;
    }

    if (char === '`') {
      const end = readTemplate(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    if (char === '"' || char === "'") {
      const literal = readString(source, index);
      const specifier = literal.value;

      if (isRelativeSpecifier(specifier) && isModuleSpecifier(source, index)) {
        output += char + appendJsExtension(specifier) + char;
      } else {
        output += source.slice(index, literal.end);
      }

      index = literal.end;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

function readString(source, start) {
  const quote = source[start];
  let value = '';
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];

    if (char === '\\') {
      value += source.slice(index, index + 2);
      index += 2;
      continue;
    }

    if (char === quote) {
      return { value, end: index + 1 };
    }

    value += char;
    index += 1;
  }

  return { value, end: source.length };
}

function readTemplate(source, start) {
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === '`') {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

function isModuleSpecifier(source, quoteIndex) {
  const before = source.slice(0, quoteIndex);

  return (
    /\bfrom\s*$/.test(before) ||
    /\bimport\s*\(\s*$/.test(before) ||
    /\bimport\s*$/.test(before)
  );
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function appendJsExtension(specifier) {
  const splitAt = firstQueryOrHashIndex(specifier);
  const pathname = splitAt === -1 ? specifier : specifier.slice(0, splitAt);
  const suffix = splitAt === -1 ? '' : specifier.slice(splitAt);

  if (pathname.endsWith('/') || EXISTING_SPECIFIER_EXTENSIONS.has(path.posix.extname(pathname))) {
    return specifier;
  }

  return `${pathname}.js${suffix}`;
}

function firstQueryOrHashIndex(value) {
  const queryIndex = value.indexOf('?');
  const hashIndex = value.indexOf('#');

  if (queryIndex === -1) {
    return hashIndex;
  }

  if (hashIndex === -1) {
    return queryIndex;
  }

  return Math.min(queryIndex, hashIndex);
}
