import { AdminHome } from './pages/AdminHome'
import { GroupPage } from './pages/GroupPage'
import { usePath } from './lib/route'

export default function App() {
  const path = usePath()
  const m = path.match(/^\/g\/([A-Za-z0-9_-]+)\/?$/)
  return m ? <GroupPage key={m[1]} id={m[1]} /> : <AdminHome />
}
