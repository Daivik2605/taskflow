import type { ReactNode } from 'react'
import { ToastProvider } from '../app/toast'
import { TaskSheetProvider } from '../components/TaskSheet'
import { AreasProvider } from './areas'
import { ProjectsProvider } from './projects'
import { TasksProvider } from './tasks'

/** Everything signed-in screens read from. Mounted inside AuthGate, so the Supabase client exists. */
export function DataProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AreasProvider>
        <ProjectsProvider>
          <TasksProvider>
            <TaskSheetProvider>{children}</TaskSheetProvider>
          </TasksProvider>
        </ProjectsProvider>
      </AreasProvider>
    </ToastProvider>
  )
}
