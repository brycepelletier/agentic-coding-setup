import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename as realRename, rm as realRm, writeFile as realWriteFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeJsonAtomically } from './atomic-write.mjs';

test('writeJsonAtomically recovers from a Windows replace conflict by removing the old file first', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-atomic-write-replace-'));
  const file = join(directory, 'run.json');
  await realWriteFile(file, 'old');
  let renameCount = 0;
  try {
    await writeJsonAtomically(file, { status: 'running' }, {
      renameImpl: async (source, destination) => {
        renameCount++;
        if (renameCount === 1) {
          const error = new Error('EPERM');
          error.code = 'EPERM';
          throw error;
        }
        await realRename(source, destination);
      },
      rmImpl: realRm,
      writeFileImpl: realWriteFile
    });
    assert.equal(JSON.parse(await readFile(file, 'utf8')).status, 'running');
    assert.equal(renameCount, 2);
  } finally {
    await realRm(directory, { recursive: true, force: true });
  }
});

test('writeJsonAtomically falls back to a direct overwrite when replace conflicts persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-atomic-write-fallback-'));
  const file = join(directory, 'run.json');
  await realWriteFile(file, 'old');
  let finalWriteCount = 0;
  try {
    await writeJsonAtomically(file, { status: 'completed' }, {
      renameImpl: async () => {
        const error = new Error('EPERM');
        error.code = 'EPERM';
        throw error;
      },
      rmImpl: async () => {},
      writeFileImpl: async (path, contents) => {
        if (path === file) finalWriteCount++;
        await realWriteFile(path, contents);
      }
    });
    assert.equal(JSON.parse(await readFile(file, 'utf8')).status, 'completed');
    assert.equal(finalWriteCount, 1);
  } finally {
    await realRm(directory, { recursive: true, force: true });
  }
});
