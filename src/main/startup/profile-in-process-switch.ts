import { closeDashboardPopout } from '../window/dashboard-popout-window'
import { closeWorkspaceSpaceWindow } from '../window/workspace-space-window'
import { loadMainWindow } from '../window/createMainWindow'
import { ensureActiveOrcaProfile, setActiveOrcaProfile } from '../orca-profiles/profile-index-store'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'
import { createProfileStateStoreForStartup } from '../persistence/profile-state/startup/profile-state-startup-authority'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { initSshHostKeyStoreFile } from '../ssh/host-keys/ssh-host-key-store'
import { initOrcadHeldFenceTokenFile } from '../managed-server/activation/orcad-held-fence-tokens'
import { configureBrowserSessionsForOrcaProfile } from '../browser/sessions/browser-session-startup'
import { browserSessionRegistry } from '../browser/sessions/profiles/browser-session-registry'
import { switchPairedRuntimeBrowserClientHostsToOrcaProfile } from '../browser/client-hosts/lifecycle/paired-runtime-browser-client-host-runtime'
import { recordDurableCrashBreadcrumb } from '../crash-reporting/breadcrumbs/durable-crash-breadcrumb'
import { desktopConnectorCloud } from './cloud-startup/main-process-connector-startup'
import { writeHttp1CompatibilityMarker } from './network-compatibility/http1-compatibility-marker'
import { reportProfileStateWriteFailure } from './profile-startup/profile-state-write-failure'
import { reportProfileStateSaveDelay } from './profile-startup/profile-state-save-delay'
import { mainProcessState as state } from './main-process-state'

export type InProcessProfileSwitchOutcome =
  /** Nothing changed; the caller may relaunch into the target as before. */
  | 'unsupported'
  /** The source profile is closed and the target is active; only a relaunch can finish loading it. */
  | 'needs-relaunch'
  | 'switched'

/**
 * Switch Orca profile without quitting: the window stays open while main swaps the profile under the
 * Store object every handler captured at startup. Terminals live in the shared daemon and keep running.
 */
export async function switchOrcaProfileInProcess(
  profileId: string
): Promise<InProcessProfileSwitchOutcome> {
  try {
    return await switchOrcaProfileInProcessOrThrow(profileId)
  } catch (error) {
    // The source profile may already be closed, so every failure must relaunch.
    console.error('[orca-profiles] In-process switch failed; relaunching:', error)
    return 'needs-relaunch'
  }
}

async function switchOrcaProfileInProcessOrThrow(
  profileId: string
): Promise<InProcessProfileSwitchOutcome> {
  const { mainWindow, store } = state
  if (state.isServeMode || state.isQuitting || !mainWindow || mainWindow.isDestroyed() || !store) {
    return 'unsupported'
  }
  recordDurableCrashBreadcrumb('profile_in_process_switch_started')
  closeDashboardPopout()
  closeWorkspaceSpaceWindow()
  // Unload the source renderer first: its unload checkpoint must land in the source profile. A veto rejects and keeps the page.
  await mainWindow.webContents.loadURL('about:blank')

  state.desktopRelayService?.fenceAndCloseNow()
  state.automations?.stop()
  await Promise.allSettled([
    state.runtime?.getOffscreenBrowserBackend()?.destroyAll?.(),
    state.runtime?.getAgentBrowserBridge()?.destroyAllSessions(),
    state.usageWorktreeHistory?.flush()
  ])
  const http1Before = store.getSettings().electronHttp1CompatibilityMode === true
  await store.flushFinalOrThrowAsync()
  await store.freezeWritesAsync()

  setActiveOrcaProfile(profileId)
  const profile = ensureActiveOrcaProfile()
  const next = await createProfileStateStoreForStartup({
    userDataPath: getProfileUserDataPath(),
    dataFile: profile.dataFile,
    databaseFile: profile.stateDatabaseFile,
    profileId: profile.profile.id,
    runtime: 'desktop',
    initializeHomeWorkspace: true,
    storageAuthority: 'desktop',
    onPersistenceFailure: reportProfileStateWriteFailure,
    onPersistenceSaveDelayChanged: reportProfileStateSaveDelay
  })
  const http1After = next.store.getSettings().electronHttp1CompatibilityMode === true
  writeHttp1CompatibilityMarker(getCanonicalUserDataPath(), http1After, profile.profile.id)
  // A Chromium switch read before app ready: only a relaunch can apply the target's value.
  if (http1After !== http1Before) {
    await next.store.freezeWritesAsync()
    return 'needs-relaunch'
  }

  store.adoptProfileStateFrom(next.store)
  state.activeOrcaProfile = profile
  initSshHostKeyStoreFile(profile.dataFile)
  initOrcadHeldFenceTokenFile(profile.dataFile)
  await switchPairedRuntimeBrowserClientHostsToOrcaProfile(profile.profile.id)
  configureBrowserSessionsForOrcaProfile({
    orcaProfileId: profile.profile.id,
    profileDirectory: profile.profileDirectory,
    listLocalSshTargetIds: () => store.getSshTargets().map((target) => target.id)
  })
  browserSessionRegistry.initializeBrowserSessionsFromPersistedState()

  state.automations?.start()
  state.desktopRelayService?.authMutated()
  desktopConnectorCloud()?.accountChanged()
  loadMainWindow(mainWindow)
  recordDurableCrashBreadcrumb('profile_in_process_switch_finished')
  return 'switched'
}
