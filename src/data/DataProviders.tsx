import type { ReactNode } from 'react'
import { ToastProvider } from '../app/toast'
import { TaskSheetProvider } from '../components/TaskSheet'
import { ActivitiesProvider } from './activities'
import { OutboxProvider } from './outbox'
import { AreasProvider } from './areas'
import { CountersProvider } from './counters'
import { GoalsProvider } from './goals'
import { ProjectsProvider } from './projects'
import { SettingsProvider } from './settings'
import { TimerProvider } from './timer'
import { TasksProvider } from './tasks'

/** Everything signed-in screens read from. Mounted inside AuthGate, so the Supabase client exists. */
export function DataProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <OutboxProvider>
      <SettingsProvider>
        <AreasProvider>
          <ProjectsProvider>
            <CountersProvider>
              <ActivitiesProvider>
                <GoalsProvider>
                  <TasksProvider>
                    <TimerProvider>
                      <TaskSheetProvider>{children}</TaskSheetProvider>
                    </TimerProvider>
                  </TasksProvider>
                </GoalsProvider>
              </ActivitiesProvider>
            </CountersProvider>
          </ProjectsProvider>
        </AreasProvider>
      </SettingsProvider>
      </OutboxProvider>
    </ToastProvider>
  )
}
