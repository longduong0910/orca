import type { Store } from './store'
import type { StoreRuntimeState } from './store-runtime-state'
import { notifySettingsChanged, notifyUIChanged } from './profile-preferences/profile-preferences'

/** Move `next`'s profile into `target`, keeping the listeners subscribed to `target` and telling them what changed. */
export function adoptStoreProfileState(
  target: Store,
  next: Store,
  targetRuntime: StoreRuntimeState,
  nextRuntime: StoreRuntimeState
): void {
  const previousSettings = targetRuntime.state.settings
  Object.assign(nextRuntime, {
    settingsChangeListeners: targetRuntime.settingsChangeListeners,
    uiChangeListeners: targetRuntime.uiChangeListeners,
    workspaceSessionWriteListeners: targetRuntime.workspaceSessionWriteListeners,
    workspaceSessionOperationListeners: targetRuntime.workspaceSessionOperationListeners,
    stateWriteListeners: targetRuntime.stateWriteListeners,
    worktreeMetaWriteListeners: targetRuntime.worktreeMetaWriteListeners,
    githubCacheWriteListeners: targetRuntime.githubCacheWriteListeners
  })
  // Own fields plus the domain context symbols the mixed-in Store methods read.
  for (const key of [...Object.getOwnPropertyNames(next), ...Object.getOwnPropertySymbols(next)]) {
    Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(next, key)!)
  }
  const changedSettings = Object.fromEntries(
    Object.entries(nextRuntime.state.settings).filter(
      ([key, value]) =>
        JSON.stringify(value) !==
        JSON.stringify(previousSettings[key as keyof typeof previousSettings])
    )
  )
  notifySettingsChanged(target, changedSettings)
  notifyUIChanged(target)
}
