import type { IconName } from './Icon'

export interface NavItem { to: string; label: string; icon: IconName }

/** Bottom tabs on phone. */
export const TABS: NavItem[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/timer', label: 'Timer', icon: 'timer' },
  { to: '/insights', label: 'Insights', icon: 'insights' },
  { to: '/more', label: 'More', icon: 'more' },
]

/** What "More" opens (also listed under the main items in the desktop sidebar). */
export const MORE: NavItem[] = [
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox' },
  { to: '/projects', label: 'Projects', icon: 'projects' },
  { to: '/work', label: 'Work', icon: 'work' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export const MORE_PATHS = ['/more', ...MORE.map((m) => m.to)]
