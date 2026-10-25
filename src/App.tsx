import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './app/AuthGate'
import { Shell } from './app/Shell'
import { DataProviders } from './data/DataProviders'
import { More } from './screens/More'
import { Settings } from './screens/Settings'
import { Tasks } from './screens/Tasks'
import { Today } from './screens/Today'
import { Work } from './screens/Work'
import { Calendar, Inbox, Projects, Timer } from './screens/screens'

export default function App() {
  return (
    <AuthGate>
      <DataProviders>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Today />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="timer" element={<Timer />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="more" element={<More />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="projects" element={<Projects />} />
            <Route path="work" element={<Work />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </DataProviders>
    </AuthGate>
  )
}
