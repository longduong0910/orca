import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultPersistedState } from '../../../shared/constants'
import { Store } from './store'

vi.mock('../../telemetry/client', () => ({ track: vi.fn() }))

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function importedStore(
  state: ReturnType<typeof getDefaultPersistedState>,
  settings: Record<string, unknown>
): Store {
  const directory = mkdtempSync(join(tmpdir(), 'orca-store-adoption-'))
  directories.push(directory)
  return new Store({
    dataFile: join(directory, 'orca-data.json'),
    serializedState: JSON.stringify({ ...state, settings: { ...state.settings, ...settings } })
  })
}

describe('Store.adoptProfileStateFrom', () => {
  it('serves the adopted profile and tells existing listeners only what changed', () => {
    const shared = getDefaultPersistedState(tmpdir())
    const source = importedStore(shared, { nodeDistMirrorUrl: 'https://source.test' })
    const target = importedStore(shared, { nodeDistMirrorUrl: 'https://target.test' })
    const listener = vi.fn()
    source.onSettingsChanged(listener)

    source.adoptProfileStateFrom(target)

    expect(source.getSettings().nodeDistMirrorUrl).toBe('https://target.test')
    expect(listener).toHaveBeenCalledTimes(1)
    const updates = listener.mock.calls[0][0]
    expect(updates).toMatchObject({ nodeDistMirrorUrl: 'https://target.test' })
    expect(updates).not.toHaveProperty('workspaceDir')
  })
})
