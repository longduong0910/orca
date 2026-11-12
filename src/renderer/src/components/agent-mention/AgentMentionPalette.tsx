import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import { PASTE_TERMINAL_TEXT_EVENT, type PasteTerminalTextDetail } from '@/constants/terminal'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/keyboard/app-keyboard-router'
import { getShortcutPlatform } from '@/lib/keyboard/shortcut-platform'
import { keybindingMatchesAction } from '../../../../shared/keybindings'
import { listAllAgents, type AddressedAgent } from './live-agent-addresses'
import { toHostSessionTabId } from '../../../../shared/workspace-layout/terminal-surface-id'
import { resolveVisibleWorkspaceHostIds } from '../../../../shared/workspace-view/workspace-host-visibility'

/** The focused pane is the one the mention is pasted into; listing its own agent is noise. */
function isCallerPane(
  agent: AddressedAgent,
  tabId: string | null,
  callerLeafId: string | null
): boolean {
  if (!tabId || agent.terminal.tabId !== toHostSessionTabId(tabId)) {
    return false
  }
  return callerLeafId === null || agent.terminal.leafId === callerLeafId
}

/** The pasted mention carries the exact send, so the reader mails it and the reply comes back. */
function mentionText({ address, serverId, terminal }: AddressedAgent): string {
  const onServer = serverId ? ` --on ${serverId}` : ''
  return `@${address} (orca orchestration send${onServer} --to ${terminal.handle}) `
}

/** Lists live agents by name and pastes a mention into the terminal that was focused. */
export function AgentMentionPalette(): React.JSX.Element {
  const t = useTranslate()
  const keybindings = useAppStore((s) => s.keybindings)
  const [agents, setAgents] = useState<AddressedAgent[] | null>(null)
  const targetTabIdRef = useRef<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const matches = keybindingMatchesAction(
        'agent.mentionPalette',
        event,
        getShortcutPlatform(),
        keybindings
      )
      if (event.defaultPrevented || !matches) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const {
        activeTabType,
        activeTabId,
        terminalLayoutsByTabId,
        visibleWorkspaceHostIds,
        workspaceHostScope
      } = useAppStore.getState()
      // Same host filter as the sidebar: hosts hidden there are hidden here.
      const visibleHostIds = resolveVisibleWorkspaceHostIds(
        visibleWorkspaceHostIds,
        workspaceHostScope
      )
      const tabId = activeTabType === 'terminal' ? activeTabId : null
      targetTabIdRef.current = tabId
      const callerLeafId = tabId ? (terminalLayoutsByTabId[tabId]?.activeLeafId ?? null) : null
      void listAllAgents().then((agents) =>
        setAgents(
          agents.filter(
            (agent) =>
              (visibleHostIds === null || visibleHostIds.includes(agent.hostId)) &&
              !isCallerPane(agent, tabId, callerLeafId)
          )
        )
      )
    }
    addAppKeyListener('keydown', onKeyDown)
    return () => removeAppKeyListener('keydown', onKeyDown)
  }, [keybindings])

  const insertMention = useCallback((agent: AddressedAgent) => {
    setAgents(null)
    const tabId = targetTabIdRef.current
    if (!tabId) {
      return
    }
    const detail: PasteTerminalTextDetail = { tabId, text: mentionText(agent) }
    window.dispatchEvent(new CustomEvent(PASTE_TERMINAL_TEXT_EVENT, { detail }))
  }, [])

  return (
    <CommandDialog
      open={agents !== null}
      onOpenChange={(open) => (open ? undefined : setAgents(null))}
      title={t('agentMentionPalette.title', 'Mention a live agent')}
      description={t('agentMentionPalette.description', 'Pick an agent to address by name')}
    >
      <CommandInput placeholder={t('agentMentionPalette.placeholder', 'Search agents…')} />
      <CommandList>
        <CommandEmpty>{t('agentMentionPalette.empty', 'No live agents')}</CommandEmpty>
        {agents?.map((agent) => (
          <CommandItem
            key={agent.address}
            value={`${agent.address} ${agent.terminal.agentIdentity} ${agent.terminal.branch}`}
            onSelect={() => insertMention(agent)}
          >
            <span className="font-medium">@{agent.address}</span>
            <span className="truncate text-muted-foreground">
              {agent.terminal.agentIdentity} ·{' '}
              {agent.terminal.branch || agent.terminal.worktreePath}
            </span>
          </CommandItem>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
