import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/keyboard/app-keyboard-router'
import { getShortcutPlatform } from '@/lib/keyboard/shortcut-platform'
import { keybindingMatchesAction } from '../../../../shared/keybindings/matching'

async function switchToNextProfile(): Promise<void> {
  const store = useAppStore.getState()
  if (store.orcaProfileSwitching) {
    return
  }
  await store.fetchOrcaProfiles()
  const { orcaProfiles, activeOrcaProfileId, switchOrcaProfile } = useAppStore.getState()
  const activeIndex = orcaProfiles.findIndex((profile) => profile.id === activeOrcaProfileId)
  const nextProfile = orcaProfiles[(activeIndex + 1) % orcaProfiles.length]
  if (nextProfile) {
    await switchOrcaProfile(nextProfile.id)
  }
}

export function useNextProfileShortcut(): void {
  const keybindings = useAppStore((s) => s.keybindings)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const matches = keybindingMatchesAction(
        'profile.switchNext',
        event,
        getShortcutPlatform(),
        keybindings
      )
      if (event.defaultPrevented || event.repeat || !matches) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      void switchToNextProfile()
    }
    addAppKeyListener('keydown', onKeyDown)
    return () => removeAppKeyListener('keydown', onKeyDown)
  }, [keybindings])
}
