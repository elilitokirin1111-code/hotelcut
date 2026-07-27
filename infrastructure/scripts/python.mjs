import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const localPython =
  process.platform === 'win32'
    ? join(process.cwd(), '.venv', 'Scripts', 'python.exe')
    : join(process.cwd(), '.venv', 'bin', 'python');

const candidates = [
  process.env.HOTELCUT_PYTHON,
  existsSync(localPython) ? localPython : undefined,
  process.platform === 'win32' ? undefined : 'python3.12',
  process.platform === 'win32' ? undefined : 'python3',
  'python',
].filter(Boolean);

for (const candidate of candidates) {
  const result = spawnSync(candidate, process.argv.slice(2), {
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
  });

  if (!result.error) {
    process.exitCode = result.status ?? 1;
    process.exit();
  }

  if (result.error.code !== 'ENOENT') {
    throw result.error;
  }
}

throw new Error(
  `Python 3.12 was not found. Create .venv or set HOTELCUT_PYTHON. PATH separator: ${delimiter}`,
);
