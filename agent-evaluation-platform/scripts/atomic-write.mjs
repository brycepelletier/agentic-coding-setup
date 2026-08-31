import { rm, rename, writeFile } from 'node:fs/promises';

export async function writeJsonAtomically(file, value, { renameImpl = rename, rmImpl = rm, writeFileImpl = writeFile } = {}) {
  const contents = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const temporary = `${file}.tmp`;
  await writeFileImpl(temporary, contents);
  await replaceFile(temporary, file, contents, { renameImpl, rmImpl, writeFileImpl });
}

async function replaceFile(temporary, file, contents, { renameImpl, rmImpl, writeFileImpl }) {
  try {
    await renameImpl(temporary, file);
    return;
  } catch (error) {
    if (!isWindowsReplaceConflict(error)) {
      await cleanupTemp(temporary);
      throw error;
    }
  }

  try {
    await rmImpl(file, { force: true });
    await renameImpl(temporary, file);
    return;
  } catch (error) {
    if (!isWindowsReplaceConflict(error)) {
      await cleanupTemp(temporary);
      throw error;
    }
  }

  try {
    await writeFileImpl(file, contents);
  } finally {
    await cleanupTemp(temporary, rmImpl);
  }
}

async function cleanupTemp(file, rmImpl = rm) {
  await rmImpl(file, { force: true }).catch(() => {});
}

function isWindowsReplaceConflict(error) {
  return error && ['EPERM', 'EACCES', 'EBUSY', 'EEXIST'].includes(error.code);
}
