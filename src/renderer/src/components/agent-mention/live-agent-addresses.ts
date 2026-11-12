import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import {
  LOCAL_EXECUTION_HOST_ID,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import {
  LiveAgentTerminals,
  terminalAddressName,
  toRemoteAgentName
} from '../../../../shared/agent-terminal-name/agent-terminal-name'
import type {
  RuntimeTerminalListResult,
  RuntimeTerminalSummary
} from '../../../../shared/runtime-types'
import { toHostSessionTabId } from '../../../../shared/workspace-layout/terminal-surface-id'

/** `address` is the display name: `orca_4dfe` here, `orca_4dfe@david_davinci` on a paired server. */
export type AddressedAgent = {
  address: string
  hostId: ExecutionHostId
  /** Paired server id for `orchestration send --on`; null for a local agent. */
  serverId: string | null
  terminal: RuntimeTerminalSummary
}

const AGENT_LIST_LIMIT = 500
const liveAgentTerminals = new LiveAgentTerminals()
const AGENT_LIST_TIMEOUT_MS = 5000
// ponytail: polling; switch to a runtime terminal subscription if 5s staleness or load matters
const TAB_NAMES_POLL_MS = 5000
const NO_ADDRESSES: readonly string[] = []

async function listNamedAgents(target: RuntimeClientTarget): Promise<RuntimeTerminalSummary[]> {
  const hostKey = target.kind === 'local' ? 'local' : target.environmentId
  try {
    const { terminals } = await callRuntimeRpc<RuntimeTerminalListResult>(
      target,
      'terminal.list',
      { limit: AGENT_LIST_LIMIT, includeVisualLayouts: false },
      { timeoutMs: AGENT_LIST_TIMEOUT_MS }
    )
    return liveAgentTerminals.filter(hostKey, terminals)
  } catch {
    return []
  }
}

async function listRemoteAgents(): Promise<AddressedAgent[]> {
  const servers = useAppStore.getState().runtimeEnvironments
  const perServer = await Promise.all(
    servers.map((server) => listNamedAgents({ kind: 'environment', environmentId: server.id }))
  )
  return perServer.flatMap((terminals, index) =>
    terminals.map((terminal) => ({
      address: toRemoteAgentName(terminalAddressName(terminal) ?? '', servers[index].name),
      hostId: toRuntimeExecutionHostId(servers[index].id),
      serverId: servers[index].id,
      terminal
    }))
  )
}

// Offline servers take seconds to time out; callers read this cache so they never wait on them.
let remoteAgents: AddressedAgent[] = []
let remoteRefresh: Promise<void> | null = null
function refreshRemoteAgents(): void {
  remoteRefresh ??= listRemoteAgents()
    .then((agents) => {
      remoteAgents = agents
    })
    .finally(() => {
      remoteRefresh = null
    })
}

export async function listAllAgents(): Promise<AddressedAgent[]> {
  refreshRemoteAgents()
  const local = await listNamedAgents({ kind: 'local' })
  const localAgents = local.map((terminal): AddressedAgent => ({
    address: terminalAddressName(terminal) ?? '',
    hostId: LOCAL_EXECUTION_HOST_ID,
    serverId: null,
    terminal
  }))
  return [...localAgents, ...remoteAgents]
}

let addressesByHostTabId = new Map<string, readonly string[]>()
const listeners = new Set<() => void>()
let pollTimer: number | null = null

async function refreshTabAddresses(): Promise<void> {
  const agents = await listAllAgents()
  const next = new Map<string, string[]>()
  for (const { address, terminal } of agents) {
    next.set(terminal.tabId, [...(next.get(terminal.tabId) ?? []), address])
  }
  let changed = next.size !== addressesByHostTabId.size
  const merged = new Map<string, readonly string[]>()
  for (const [tabId, addresses] of next) {
    const previous = addressesByHostTabId.get(tabId)
    const same = previous?.join(',') === addresses.join(',')
    changed ||= !same
    // Reusing the old array keeps tabs whose names did not change from re-rendering.
    merged.set(tabId, same && previous ? previous : addresses)
  }
  if (changed) {
    addressesByHostTabId = merged
    listeners.forEach((listener) => listener())
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (pollTimer === null) {
    void refreshTabAddresses()
    pollTimer = window.setInterval(() => void refreshTabAddresses(), TAB_NAMES_POLL_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && pollTimer !== null) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
  }
}

/** Agent addresses running in this tab's panes, e.g. `['orca_4dfe']`. */
export function useTabAgentAddresses(tabId: string): readonly string[] {
  const hostTabId = toHostSessionTabId(tabId)
  return useSyncExternalStore(subscribe, () => addressesByHostTabId.get(hostTabId) ?? NO_ADDRESSES)
}
