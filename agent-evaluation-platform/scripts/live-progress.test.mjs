import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLiveProgressWriter } from './live-progress.mjs';

test('persists the complete visible and reasoning streams for the candidate page', async () => {
  const directory = await mkdtemp(join(tmpdir(),'agent-live-progress-'));
  const file = join(directory,'live-progress.json');
  try {
    const writer = createLiveProgressWriter(file,{ runId:'run',model:'candidate' },{ intervalMs:1 });
    writer.update({ visibleDelta:'first ',reasoningDelta:'think ' });
    writer.update({ visibleDelta:'second',reasoningDelta:'again' });
    await writer.flush({ stage:'completed' });
    const snapshot=JSON.parse(await readFile(file,'utf8'));
    assert.equal(snapshot.visibleOutput,'first second');
    assert.equal(snapshot.reasoningOutput,'think again');
    assert.equal(snapshot.stage,'completed');
  } finally {
    await rm(directory,{ recursive:true,force:true });
  }
});
