import type {
  AiVaultPrepareSessionResumeArgs,
  AiVaultPrepareSessionResumeResult
} from '../../../shared/ai-vault/resume/ai-vault-resume-preparation'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import type { InProcessProfileSwitchOutcome } from '../../startup/profile-in-process-switch'
import { settleWithinMs } from '../../startup/quit/quit-teardown-deadline'

const RELAUNCH_DISMISSAL_CLOSE_TIMEOUT_MS = 2_000

export async function closeNotificationDismissalsBeforeRelaunch(
  runtime: OrcaRuntimeService
): Promise<void> {
  const result = await settleWithinMs(
    runtime.closeNotificationDismissals(),
    RELAUNCH_DISMISSAL_CLOSE_TIMEOUT_MS
  )
  if (result.outcome === 'timed-out') {
    console.warn('[notifications] Relaunching before dismissal recovery state finished saving')
  }
}

export type CoreHandlerLifecycleOptions = {
  deferHostInitialization?: boolean
  hostInitialization?: Promise<void>
  switchOrcaProfileInProcess?: (profileId: string) => Promise<InProcessProfileSwitchOutcome>
  onBeforeRelaunch?: () => void | Promise<void>
  onOrcaProfileAuthMutation?: () => void
  onBeforeOrcaProfileSignOut?: () => void
  onAfterOrcaProfileSignOut?: () => void
  getAdditionalAiVaultCodexHomePaths?: () => readonly string[]
  prepareAiVaultSessionResume?: (
    args: AiVaultPrepareSessionResumeArgs
  ) => Promise<AiVaultPrepareSessionResumeResult>
}
