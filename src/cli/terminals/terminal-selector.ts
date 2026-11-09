import type { RuntimeClient } from '../runtime/client'
import type { RuntimeTerminalListResult } from '../../shared/terminal/runtime/runtime-terminal-contracts'
import { terminalAddressName } from '../../shared/agent-terminal-name/agent-terminal-name'
import { getPresentStringFlag } from '../arguments/flags'
import type { WorkspaceSelectionPurpose } from '../workspace-selection/caller-host-worktree-selection'
import { getBrowserWorktreeSelector } from '../workspace-selection/workspace-selector'

const AGENT_NAME_LOOKUP_LIMIT = 500
// `<dir>_<hex tag>` or Claude Code's `<dir>-<n>` agent names; raw `term_<uuid>` handles pass through untouched.
const AGENT_NAME_PATTERN = /^(?!term_)[a-z0-9]+(?:[_-][a-z0-9]+)+$/

async function resolveAgentNameHandle(name: string, client: RuntimeClient): Promise<string> {
  const response = await client.call<RuntimeTerminalListResult>('terminal.list', {
    limit: AGENT_NAME_LOOKUP_LIMIT,
    includeVisualLayouts: false
  })
  // The name embeds the handle tag, so matching does not need this read's agent detection.
  const match = response.result.terminals.find((terminal) => terminalAddressName(terminal) === name)
  // Unknown names fall through so the runtime reports its usual unknown-handle error.
  return match?.handle ?? name
}

export async function getTerminalHandle(
  flags: Map<string, string | boolean>,
  cwd: string,
  client: RuntimeClient,
  options: { requireUnambiguous?: boolean; purpose?: WorkspaceSelectionPurpose } = {}
): Promise<string> {
  const explicit = getPresentStringFlag(flags, 'terminal')
  if (explicit) {
    return AGENT_NAME_PATTERN.test(explicit) ? resolveAgentNameHandle(explicit, client) : explicit
  }
  const worktree = await getBrowserWorktreeSelector(flags, cwd, client, options.purpose)
  const response = await client.call<{ handle: string }>('terminal.resolveActive', {
    worktree,
    ...(options.requireUnambiguous ? { requireUnambiguous: true } : {})
  })
  return response.result.handle
}
