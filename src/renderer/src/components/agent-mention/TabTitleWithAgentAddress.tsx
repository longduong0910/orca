import { TAB_LABEL_WIDTH_CLASSES } from '../tab-bar/tab-width-rules'
import { useTabAgentAddresses } from './live-agent-addresses'

/** Tab title with the tab's agent address (`@orca_4dfe`) on a second line, so the tab stays narrow. */
export function TabTitleWithAgentAddress({
  tabId,
  title
}: {
  tabId: string
  title: string
}): React.JSX.Element {
  const addresses = useTabAgentAddresses(tabId)
  if (addresses.length === 0) {
    return <span className={`${TAB_LABEL_WIDTH_CLASSES} mr-1`}>{title}</span>
  }
  const label = addresses.map((address) => `@${address}`).join(' ')
  return (
    // `.tab-label` stays on the title line: TabHoverCard measures it to detect a clipped title.
    <span className="mr-1 flex min-w-0 flex-1 flex-col justify-center">
      <span className="tab-label truncate leading-tight">{title}</span>
      <span className="truncate text-[10px] leading-tight text-muted-foreground">{label}</span>
    </span>
  )
}
