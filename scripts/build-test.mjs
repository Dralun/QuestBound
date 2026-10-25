import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { TEST_API_URL, TEST_BASE_URL } from '../tests/fixtures/config.ts'

const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_GAME_API_URL: TEST_API_URL,
    VITE_BASE_PATH: TEST_BASE_URL,
  },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
