import { useMemo } from 'react'
import type { GoalInputs } from '../lib/goals'
import { useActivities } from './activities'
import { useAreas } from './areas'
import { useCounters } from './counters'
import { useGoals } from './goals'
import { useSettings } from './settings'
import { useTasks } from './tasks'

/** Everything the goal maths in lib/goals.ts reads, from the providers. Time on a tag comes from activity logs until the timer exists (phase 4). */
export function useGoalInputs(): GoalInputs {
  const { tasks } = useTasks()
  const { events } = useCounters()
  const { logs } = useActivities()
  const { areas } = useAreas()
  const { daysOff } = useGoals()
  const { weekStartsOn } = useSettings()
  return useMemo(() => ({ tasks, events, sessions: logs, logs, areas, daysOff, weekStart: weekStartsOn }), [tasks, events, logs, areas, daysOff, weekStartsOn])
}
