import {
  DEFAULT_LOCAL_ORCA_PROFILE_NAME,
  type OrcaProfileIndex,
  type OrcaProfileListState
} from '../../shared/orca-profiles'
import { getOrcaProfileIndexPath, getProfileUserDataPath } from './profile-storage-paths'
import {
  loadOrCreateProfileIndex,
  sanitizeProfileName,
  writeProfileIndex
} from './profile-index-store'

function profileNameInitial(name: string): string {
  const initial = name.match(/[A-Za-z0-9]/)?.[0] ?? DEFAULT_LOCAL_ORCA_PROFILE_NAME[0]
  return initial.toUpperCase()
}

export function renameOrcaProfile(
  profileId: string,
  rawName: unknown,
  userDataPath = getProfileUserDataPath()
): OrcaProfileListState {
  const index = loadOrCreateProfileIndex(userDataPath)
  const name = sanitizeProfileName(rawName)
  const now = Date.now()
  let found = false
  const profiles = index.profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile
    }
    found = true
    const avatar =
      profile.avatar.kind === 'initials'
        ? { ...profile.avatar, initials: profileNameInitial(name) }
        : profile.avatar
    return { ...profile, name, avatar, updatedAt: now }
  })
  if (!found) {
    throw new Error('unknown_orca_profile')
  }
  const nextIndex: OrcaProfileIndex = { ...index, profiles }
  writeProfileIndex(getOrcaProfileIndexPath(userDataPath), nextIndex)
  return {
    activeProfileId: nextIndex.activeProfileId,
    profiles: nextIndex.profiles
  }
}
