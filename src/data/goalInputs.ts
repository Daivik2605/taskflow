import { useMemo } from 'react'
import type { GoalInputs } from '../lib/goals'
import { useActivities } from './activities'
import { useTimeIntervals } from './timer'
import { useAreas } from './areas'
import { useCounters } from './counters'
import { useGoals } from './goals'
import { useSettings } from './settings'
import { useTasks } from './tasks'

/** Everything the goal maths in lib/goals.ts reads, from the providers. Time on a tag is every stretch: activity-button logs plus timer segments. */
export function useGoalInputs(): GoalInputs {
  const { tasks } = useTasks()
  const { events } = useCounters()
  const { logs } = useActivities()
  const { areas } = useAreas()
  const sessions = useTimeIntervals()
  const { daysOff } = useGoals()
  const { weekStartsOn } = useSettings()
  return useMemo(() => ({ tasks, events, sessions, logs, areas, daysOff, weekStart: weekStartsOn }), [tasks, events, sessions, logs, areas, daysOff, weekStartsOn])
}
