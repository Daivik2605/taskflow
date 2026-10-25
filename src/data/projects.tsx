import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { db, friendlyDbError } from './db'

export interface ProjectRef { id: string; name: string; status: string }

const Ctx = createContext<ProjectRef[]>([])
export const ProjectsContext = Ctx
export const useProjects = () => useContext(Ctx)

/** Read-only list for pickers and filters. Projects get their own screen in phase 10. */
export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { reportError } = useConnection()
  const [projects, setProjects] = useState<ProjectRef[]>([])
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await db().from('taskflow_projects').select('id,name,status').order('name')
      if (cancelled) return
      if (error) reportError(friendlyDbError(error))
      else setProjects((data ?? []) as ProjectRef[])
    }
    void load()
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [reportError])
  return <Ctx.Provider value={projects}>{children}</Ctx.Provider>
}
