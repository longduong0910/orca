export function toAgentNameSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || 'agent'
}

/** An agent on a paired server is addressed as `<its name>@<server slug>`. */
export function toRemoteAgentName(agentName: string, serverName: string): string {
  return `${agentName}@${toAgentNameSlug(serverName)}`
}

export function parseRemoteAgentName(
  value: string
): { agentName: string; serverSlug: string } | null {
  const match = /^((?!term_)[a-z0-9_-]+)@([a-z0-9_]+)$/.exec(value)
  return match ? { agentName: match[1], serverSlug: match[2] } : null
}

const HANDLE_PREFIX = 'term_'
const HANDLE_TAG_LENGTH = 4

type AddressableTerminal = {
  agentIdentity?: string
  agentSessionName?: string
  handle: string
  worktreeId: string
  worktreePath: string
}

/** The agent's own session name when it has one (`orca-d9`), else `<worktree dir>_<handle tag>` (`orca_4dfe`). */
export function terminalAddressName(terminal: AddressableTerminal): string | null {
  if (terminal.agentSessionName) {
    return terminal.agentSessionName
  }
  if (!terminal.handle.startsWith(HANDLE_PREFIX)) {
    return null
  }
  const path = terminal.worktreePath || terminal.worktreeId.split('::')[1] || ''
  const directory = path.split(/[\\/]/).pop() ?? ''
  const tag = terminal.handle.slice(HANDLE_PREFIX.length, HANDLE_PREFIX.length + HANDLE_TAG_LENGTH)
  return `${toAgentNameSlug(directory)}_${tag}`
}

export function agentAddressName(terminal: AddressableTerminal): string | null {
  return terminal.agentIdentity ? terminalAddressName(terminal) : null
}

/** Hosts report agentIdentity intermittently for orphaned PTYs; keep a seen agent until its terminal is gone. */
export class LiveAgentTerminals {
  private readonly seenByHost = new Map<string, Set<string>>()

  /** `terminals` must be the host's full list: handles missing from it are forgotten. */
  filter<T extends AddressableTerminal>(hostKey: string, terminals: readonly T[]): T[] {
    const present = new Set(terminals.map((terminal) => terminal.handle))
    const seen = new Set(
      [...(this.seenByHost.get(hostKey) ?? [])].filter((handle) => present.has(handle))
    )
    for (const terminal of terminals) {
      if (terminal.agentIdentity) {
        seen.add(terminal.handle)
      }
    }
    this.seenByHost.set(hostKey, seen)
    return terminals.filter((terminal) => seen.has(terminal.handle))
  }
}
