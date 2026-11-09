import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import type { AgentProviderSessionMetadata } from '../../shared/agent-session/lifecycle/agent-session-resume'

const CACHE_TTL_MS = 2000
let cached: { dir: string; at: number; names: Map<string, string> } | null = null

// Transcripts live at `<config dir>/projects/...`, so a profile's CLAUDE_CONFIG_DIR is found too.
function claudeConfigDir(transcriptPath: string | undefined): string {
  const marker = `${sep}projects${sep}`
  const index = transcriptPath?.lastIndexOf(marker) ?? -1
  if (transcriptPath && index > 0) {
    return transcriptPath.slice(0, index)
  }
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
}

function readSessionNames(dir: string): Map<string, string> {
  const names = new Map<string, string>()
  let files: string[] = []
  try {
    files = readdirSync(dir).filter((file) => file.endsWith('.json'))
  } catch {
    return names
  }
  for (const file of files) {
    try {
      const record = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
        sessionId?: unknown
        name?: unknown
      }
      if (typeof record.sessionId === 'string' && typeof record.name === 'string') {
        names.set(record.sessionId, record.name)
      }
    } catch {
      // Claude rewrites these files in place; a torn read just misses this poll.
    }
  }
  return names
}

/** The name Claude Code gives a live session (`orca-d9`), as its own agent messaging addresses it. */
export function readClaudeSessionName(session: AgentProviderSessionMetadata): string | null {
  if (session.key !== 'session_id') {
    return null
  }
  const dir = join(claudeConfigDir(session.transcriptPath), 'sessions')
  const now = Date.now()
  if (!cached || cached.dir !== dir || now - cached.at > CACHE_TTL_MS) {
    cached = { dir, at: now, names: readSessionNames(dir) }
  }
  return cached.names.get(session.id) ?? null
}
