import type { IconName } from './Icon'

export interface NavItem { to: string; label: string; icon: IconName; /** Still a "Coming in phase N" screen. The phase that builds it removes this flag. */ placeholder?: boolean }

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
  { to: '/calendar', label: 'Calendar', icon: 'calendar', placeholder: true },
  { to: '/inbox', label: 'Inbox', icon: 'inbox', placeholder: true },
  { to: '/projects', label: 'Projects', icon: 'projects', placeholder: true },
  { to: '/work', label: 'Work', icon: 'work', placeholder: true },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

/** The phone's More list; with "Hide unfinished screens" on, placeholder screens are left out (their URLs and the desktop sidebar still work). */
export const moreItems = (hideUnfinished: boolean): NavItem[] => (hideUnfinished ? MORE.filter((m) => !m.placeholder) : MORE)

export const MORE_PATHS = ['/more', ...MORE.map((m) => m.to)]
