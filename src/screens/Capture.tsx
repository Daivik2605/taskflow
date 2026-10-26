import { Link } from 'react-router-dom'
import { Placeholder } from './Placeholder'

/** The home-screen "Quick capture" shortcut lands here. The route stays; the capture box arrives with the Inbox in phase 9. */
export function Capture() {
  return (
    <Placeholder title="Quick capture" phase={9} blurb="Type or speak a thought and it lands in your Inbox to sort later.">
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Until then, add it as a task from <Link to="/tasks" className="text-indigo-600 dark:text-indigo-400">Tasks</Link>.</p>
    </Placeholder>
  )
}
