import React, { useState } from 'react'
import { Check, Loader2, Pencil, Plus, UserRound } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTranslate } from '@/i18n/use-translate'

const KEY = 'auto.components.sidebar.SidebarProfileSwitcher'

type NameDialog = { mode: 'create' } | { mode: 'rename'; profileId: string }

export function SidebarProfileSwitcher(): React.JSX.Element {
  const t = useTranslate()
  const profiles = useAppStore((s) => s.orcaProfiles)
  const activeProfileId = useAppStore((s) => s.activeOrcaProfileId)
  const switching = useAppStore((s) => s.orcaProfileSwitching)
  const fetchOrcaProfiles = useAppStore((s) => s.fetchOrcaProfiles)
  const createLocalOrcaProfile = useAppStore((s) => s.createLocalOrcaProfile)
  const renameOrcaProfile = useAppStore((s) => s.renameOrcaProfile)
  const switchOrcaProfile = useAppStore((s) => s.switchOrcaProfile)
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [nameDraft, setNameDraft] = useState('')

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId)
  const isRenaming = nameDialog?.mode === 'rename'

  const handleMenuOpenChange = (open: boolean): void => {
    if (open) {
      void fetchOrcaProfiles()
    }
  }

  const openCreateDialog = (): void => {
    setNameDraft('')
    setNameDialog({ mode: 'create' })
  }

  const openRenameDialog = (): void => {
    if (!activeProfile) {
      return
    }
    setNameDraft(activeProfile.name)
    setNameDialog({ mode: 'rename', profileId: activeProfile.id })
  }

  const submitName = async (): Promise<void> => {
    const name = nameDraft.trim()
    if (!name || !nameDialog) {
      return
    }
    setNameDialog(null)
    if (nameDialog.mode === 'rename') {
      await renameOrcaProfile(nameDialog.profileId, name)
      return
    }
    const created = await createLocalOrcaProfile(name)
    if (created) {
      await switchOrcaProfile(created.id)
    }
  }

  return (
    <>
      <DropdownMenu modal={false} onOpenChange={handleMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            disabled={switching}
            aria-label={t(`${KEY}.switchProfile`, 'Switch profile')}
            className="min-w-0 gap-1 text-muted-foreground"
          >
            {switching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <UserRound className="size-3.5" />
            )}
            <span className="truncate">
              {activeProfile?.name ?? t(`${KEY}.profile`, 'Profile')}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-52">
          {profiles.map((profile) => (
            <DropdownMenuItem key={profile.id} onSelect={() => void switchOrcaProfile(profile.id)}>
              <UserRound className="size-3.5" />
              <span className="truncate">{profile.name}</span>
              {profile.id === activeProfileId ? <Check className="ml-auto size-3.5" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openRenameDialog} disabled={!activeProfile}>
            <Pencil className="size-3.5" />
            {t(`${KEY}.renameProfile`, 'Rename current profile…')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openCreateDialog}>
            <Plus className="size-3.5" />
            {t(`${KEY}.newProfile`, 'New profile…')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={nameDialog !== null} onOpenChange={(open) => !open && setNameDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {isRenaming
                ? t(`${KEY}.renameProfileTitle`, 'Rename profile')
                : t(`${KEY}.newProfileTitle`, 'New profile')}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={nameDraft}
            placeholder={t(`${KEY}.namePlaceholder`, 'Profile name')}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submitName()
              }
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNameDialog(null)}>
              {t(`${KEY}.cancel`, 'Cancel')}
            </Button>
            <Button type="button" disabled={!nameDraft.trim()} onClick={() => void submitName()}>
              {isRenaming
                ? t(`${KEY}.save`, 'Save')
                : t(`${KEY}.createAndSwitch`, 'Create & switch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
