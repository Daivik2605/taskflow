import type { ReactNode } from 'react'
import { ToastProvider } from '../app/toast'
import { TaskSheetProvider } from '../components/TaskSheet'
import { ActivitiesProvider } from './activities'
import { AreasProvider } from './areas'
import { CountersProvider } from './counters'
import { GoalsProvider } from './goals'
import { ProjectsProvider } from './projects'
import { SettingsProvider } from './settings'
import { TasksProvider } from './tasks'

/** Everything signed-in screens read from. Mounted inside AuthGate, so the Supabase client exists. */
export function DataProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <SettingsProvider>
        <AreasProvider>
          <ProjectsProvider>
            <CountersProvider>
              <ActivitiesProvider>
                <GoalsProvider>
                  <TasksProvider>
                    <TaskSheetProvider>{children}</TaskSheetProvider>
                  </TasksProvider>
                </GoalsProvider>
              </ActivitiesProvider>
            </CountersProvider>
          </ProjectsProvider>
        </AreasProvider>
      </SettingsProvider>
    </ToastProvider>
  )
}
