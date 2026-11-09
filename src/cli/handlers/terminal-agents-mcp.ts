import { createInterface } from 'node:readline'
import type { RuntimeTerminalListResult, RuntimeTerminalSummary } from '../../shared/runtime-types'
import type { CommandHandler } from '../dispatch'
import { getDefaultUserDataPath, RuntimeClient } from '../runtime-client'
import { listEnvironments } from '../../shared/remote-runtime/host-store/runtime-environment-store'
import { hostname } from 'node:os'
import {
  LiveAgentTerminals,
  terminalAddressName,
  toRemoteAgentName
} from '../../shared/agent-terminal-name/agent-terminal-name'

const AGENT_URI_PREFIX = 'agent://'
const AGENT_LIST_LIMIT = 500
const liveAgentTerminals = new LiveAgentTerminals()
const AGENT_POLL_MS = 5000
const SERVER_LIST_TIMEOUT_MS = 5000

const METHOD_NOT_FOUND = -32601
const INTERNAL_ERROR = -32603

type JsonRpcRequest = { id?: string | number; method: string; params?: Record<string, unknown> }
type JsonRpcMessage = {
  jsonrpc: '2.0'
  id?: string | number
  method?: string
  result?: unknown
  error?: { code: number; message: string }
}

class MethodNotFoundError extends Error {}

function parseJsonRpcRequest(line: string): JsonRpcRequest | null {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const fields = new Map(Object.entries(value))
  const id = fields.get('id')
  const method = fields.get('method')
  const params = fields.get('params')
  if (typeof method !== 'string') {
    return null
  }
  const validId = typeof id === 'string' || typeof id === 'number' ? id : undefined
  const validParams =
    typeof params === 'object' && params !== null ? Object.fromEntries(Object.entries(params)) : {}
  return { id: validId, method, params: validParams }
}

/** `address` is what `--terminal` accepts: `orca_4dfe` here, `orca_4dfe@david_davinci` on a paired server. */
type AddressedAgent = { address: string; isLocal: boolean; terminal: RuntimeTerminalSummary }

async function listNamedAgents(
  hostKey: string,
  client: RuntimeClient
): Promise<RuntimeTerminalSummary[]> {
  try {
    const response = await client.call<RuntimeTerminalListResult>('terminal.list', {
      limit: AGENT_LIST_LIMIT,
      includeVisualLayouts: false
    })
    return liveAgentTerminals.filter(hostKey, response.result.terminals)
  } catch {
    // ponytail: unreachable runtime = no agents; Claude Code keeps the server alive and asks again later
    return []
  }
}

async function listRemoteAgents(): Promise<AddressedAgent[]> {
  const servers = listEnvironments(getDefaultUserDataPath())
  const perServer = await Promise.all(
    servers.map((server) =>
      listNamedAgents(
        server.id,
        new RuntimeClient(getDefaultUserDataPath(), SERVER_LIST_TIMEOUT_MS, null, server.id)
      )
    )
  )
  return perServer.flatMap((terminals, index) =>
    terminals.map((terminal) => ({
      address: toRemoteAgentName(terminalAddressName(terminal) ?? '', servers[index].name),
      isLocal: false,
      terminal
    }))
  )
}

async function listLocalAgents(client: RuntimeClient): Promise<AddressedAgent[]> {
  const terminals = await listNamedAgents('local', client)
  return terminals.map((terminal) => ({
    address: terminalAddressName(terminal) ?? '',
    isLocal: true,
    terminal
  }))
}

function describeAgent(agent: AddressedAgent, self: AddressedAgent | undefined): string {
  const { address, terminal } = agent
  // A remote reply needs this machine paired on its side; the raw handle works on any Orca version.
  const replyTo = self ? `@${self.address}, handle ${self.terminal.handle} on ${hostname()}` : null
  const signature = replyTo
    ? `Start the message with "[from ${replyTo}]" so ${address} can reply to you.`
    : 'Say who you are in the message so it can reply.'
  return [
    `@${address}: ${terminal.agentIdentity} agent in ${terminal.worktreePath} (branch ${terminal.branch || 'none'}).`,
    `Message it: orca terminal send --terminal ${address} --text "<message>" --enter`,
    `Read its screen: orca terminal read --terminal ${address} --screen`,
    signature
  ].join('\n')
}

/** Stdio MCP server exposing live Orca agents as resources, so `@` in Claude Code lists them. */
export const terminalAgentsMcpHandler: CommandHandler = async ({ client }) => {
  const selfHandle = process.env.ORCA_TERMINAL_HANDLE
  const send = (message: JsonRpcMessage) => process.stdout.write(`${JSON.stringify(message)}\n`)
  let lastAddresses = ''
  // Offline servers take seconds to time out; requests read this cache so they never wait on them.
  let remoteAgents: AddressedAgent[] = []
  let remoteRefresh: Promise<void> | null = null
  const refreshRemoteAgents = () => {
    remoteRefresh ??= listRemoteAgents()
      .then((agents) => {
        remoteAgents = agents
      })
      .finally(() => {
        remoteRefresh = null
      })
  }
  refreshRemoteAgents()

  const listOthers = async () => {
    const agents = [...(await listLocalAgents(client)), ...remoteAgents]
    const isSelf = (agent: AddressedAgent) => agent.isLocal && agent.terminal.handle === selfHandle
    const others = agents.filter((agent) => !isSelf(agent))
    return { others, self: agents.find(isSelf) }
  }

  const poll = setInterval(async () => {
    refreshRemoteAgents()
    const { others } = await listOthers()
    const addresses = others.map((agent) => agent.address).join(',')
    if (addresses !== lastAddresses) {
      lastAddresses = addresses
      send({ jsonrpc: '2.0', method: 'notifications/resources/list_changed' })
    }
  }, AGENT_POLL_MS)

  const handle = async (request: JsonRpcRequest): Promise<unknown> => {
    switch (request.method) {
      case 'initialize':
        return {
          protocolVersion: request.params?.protocolVersion ?? '2025-06-18',
          capabilities: { resources: { listChanged: true } },
          serverInfo: { name: 'orca-agents', version: '1.0.0' }
        }
      case 'ping':
        return {}
      case 'resources/list': {
        const { others } = await listOthers()
        lastAddresses = others.map((agent) => agent.address).join(',')
        const resources = others.map((agent) => ({
          uri: `${AGENT_URI_PREFIX}${agent.address}`,
          name: agent.address,
          description: `${agent.terminal.agentIdentity} in ${agent.terminal.worktreePath}`,
          mimeType: 'text/plain'
        }))
        return { resources }
      }
      case 'resources/read': {
        const uri = String(request.params?.uri ?? '')
        const name = uri.slice(AGENT_URI_PREFIX.length)
        const { others, self } = await listOthers()
        const agent = others.find((candidate) => candidate.address === name)
        const text = agent ? describeAgent(agent, self) : `@${name} is no longer running.`
        return { contents: [{ uri, mimeType: 'text/plain', text }] }
      }
      default:
        throw new MethodNotFoundError(`Method not found: ${request.method}`)
    }
  }

  const lines = createInterface({ input: process.stdin })
  for await (const line of lines) {
    const request = parseJsonRpcRequest(line)
    // Notifications carry no id and expect no reply.
    if (!request || request.id === undefined) {
      continue
    }
    try {
      const result = await handle(request)
      send({ jsonrpc: '2.0', id: request.id, result })
    } catch (error) {
      const code = error instanceof MethodNotFoundError ? METHOD_NOT_FOUND : INTERNAL_ERROR
      send({ jsonrpc: '2.0', id: request.id, error: { code, message: String(error) } })
    }
  }
  clearInterval(poll)
}
