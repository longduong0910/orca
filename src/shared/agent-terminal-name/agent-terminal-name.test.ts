import { describe, expect, it } from 'vitest'
import {
  agentAddressName,
  LiveAgentTerminals,
  parseRemoteAgentName,
  toRemoteAgentName
} from './agent-terminal-name'

describe('remote agent names', () => {
  it('round-trips a server name with spaces and diacritics', () => {
    const address = toRemoteAgentName('orca_4dfe', 'Tony Stày')
    expect(address).toBe('orca_4dfe@tony_stay')
    expect(parseRemoteAgentName(address)).toEqual({
      agentName: 'orca_4dfe',
      serverSlug: 'tony_stay'
    })
  })

  it('ignores runtime handles and bare names', () => {
    expect(parseRemoteAgentName('term_4dfe6264-9b08')).toBeNull()
    expect(parseRemoteAgentName('orca_4dfe')).toBeNull()
  })

  it('names agents by worktree dir and handle tag', () => {
    const terminal = {
      handle: 'term_0728d195-113b-4c23-8516-e62f452b2fc0',
      worktreeId: 'repo-1::/Users/me/be_creative_studio_app',
      worktreePath: '',
      agentIdentity: 'claude'
    }
    expect(agentAddressName(terminal)).toBe('be_creative_studio_app_0728')
    expect(agentAddressName({ ...terminal, agentIdentity: undefined })).toBeNull()
    expect(agentAddressName({ ...terminal, agentSessionName: 'be-creative-studio-app-39' })).toBe(
      'be-creative-studio-app-39'
    )
    expect(parseRemoteAgentName('be-creative-studio-app-39@david_davinci')?.agentName).toBe(
      'be-creative-studio-app-39'
    )
    expect(parseRemoteAgentName('be_creative_studio_app_0728@david_davinci')).toEqual({
      agentName: 'be_creative_studio_app_0728',
      serverSlug: 'david_davinci'
    })
  })

  it('keeps a seen agent through identity gaps until its terminal is gone, per host', () => {
    const live = new LiveAgentTerminals()
    const agent = {
      handle: 'term_aaaa',
      worktreeId: 'r::/x',
      worktreePath: '/x',
      agentIdentity: 'claude'
    }
    const gap = { ...agent, agentIdentity: undefined }
    const shell = { handle: 'term_bbbb', worktreeId: 'r::/x', worktreePath: '/x' }

    expect(live.filter('local', [agent, shell])).toEqual([agent])
    expect(live.filter('server', [])).toEqual([])
    expect(live.filter('local', [gap, shell])).toEqual([gap])
    expect(live.filter('local', [shell])).toEqual([])
    expect(live.filter('local', [gap])).toEqual([])
  })
})
