import {
  parseRemoteAgentName,
  toAgentNameSlug
} from '../shared/agent-terminal-name/agent-terminal-name'
import { listEnvironments } from '../shared/remote-runtime/host-store/runtime-environment-store'
import { getDefaultUserDataPath } from './runtime-client'

/** `--terminal orca_4dfe@david_davinci` becomes `--environment <id> --terminal orca_4dfe`. */
export function applyRemoteAgentTerminalRoute(flags: Map<string, string | boolean>): void {
  const terminal = flags.get('terminal')
  if (typeof terminal !== 'string' || flags.has('environment')) {
    return
  }
  const remote = parseRemoteAgentName(terminal)
  if (!remote) {
    return
  }
  const environment = listEnvironments(getDefaultUserDataPath()).find(
    (candidate) => toAgentNameSlug(candidate.name) === remote.serverSlug
  )
  if (!environment) {
    return
  }
  flags.set('environment', environment.id)
  flags.set('terminal', remote.agentName)
}
