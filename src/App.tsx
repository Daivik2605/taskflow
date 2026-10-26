import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './app/AuthGate'
import { Shell } from './app/Shell'
import { DataProviders } from './data/DataProviders'
import { Capture } from './screens/Capture'
import { More } from './screens/More'
import { Settings } from './screens/Settings'
import { Shutdown } from './screens/Shutdown'
import { Tasks } from './screens/Tasks'
import { Today } from './screens/Today'
import { Work } from './screens/Work'
import { Timer } from './screens/Timer'
import { Calendar, Inbox, Projects } from './screens/screens'

// Insights pulls in the charting library, so it loads only when opened.
const Insights = lazy(() => import('./screens/Insights'))

export default function App() {
  return (
    <AuthGate>
      <DataProviders>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Today />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="timer" element={<Timer />} />
            <Route path="insights" element={<Suspense fallback={<p role="status" className="text-sm text-slate-500">Loading…</p>}><Insights /></Suspense>} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="more" element={<More />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="projects" element={<Projects />} />
            <Route path="work" element={<Work />} />
            <Route path="capture" element={<Capture />} />
            <Route path="shutdown" element={<Shutdown />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </DataProviders>
    </AuthGate>
  )
}
