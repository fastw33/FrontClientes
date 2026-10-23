import { Navigate, Route, Routes } from 'react-router-dom'
import { Brand } from './components/Brand'
import { Loading } from './components/UI'
import { useAuth } from './context/AuthContext'
import { PortalLayout } from './layouts/PortalLayout'
import { Login } from './pages/Login'
import { Password } from './pages/Password'
import { Terms } from './pages/Terms'
import { Home } from './pages/Home'
import { Security } from './pages/Security'
import { Upcoming } from './pages/Upcoming'
import { Inventory } from './pages/Inventory'
import { Preloads } from './pages/Preloads'
import { Operations } from './pages/Operations'
import { Movements } from './pages/Movements'
import { Documents } from './pages/Documents'
import { accessStep } from './utils/auth'
import { navigation } from './utils/navigation'

function Gate({ children, step = '/inicio' }) {
  const { session } = useAuth()
  const destination = accessStep(session)
  return destination === step ? children : <Navigate to={destination} replace />
}

export default function App() {
  const { session, loading } = useAuth()
  if (loading)
    return (
      <main className="boot-screen">
        <Brand />
        <Loading label="Preparando tu espacio Fastway…" />
      </main>
    )
  return (
    <Routes>
      <Route
        path="/ingreso"
        element={session ? <Navigate to={accessStep(session)} replace /> : <Login />}
      />
      <Route
        path="/primer-ingreso"
        element={
          <Gate step="/primer-ingreso">
            <Password firstEntry />
          </Gate>
        }
      />
      <Route
        path="/terminos"
        element={
          <Gate step="/terminos">
            <Terms />
          </Gate>
        }
      />
      <Route
        path="/contrasena"
        element={
          <Gate>
            <Password />
          </Gate>
        }
      />
      <Route
        element={
          <Gate>
            <PortalLayout />
          </Gate>
        }
      >
        <Route path="/inicio" element={<Home />} />
        <Route path="/seguridad" element={<Security />} />
        <Route path="/inventario" element={<Inventory />} />
        <Route path="/precargas" element={<Preloads />} />
        <Route path="/operaciones" element={<Operations />} />
        <Route path="/movimientos" element={<Movements />} />
        <Route path="/documentos" element={<Documents />} />
        <Route path="/alistamientos" element={<Navigate to="/operaciones" replace />} />
        <Route path="/agenda" element={<Navigate to="/operaciones" replace />} />
        {navigation
          .filter((item) => item.planned)
          .map((item) => (
            <Route path={item.path} key={item.path} element={<Upcoming />} />
          ))}
      </Route>
      <Route path="*" element={<Navigate to={accessStep(session)} replace />} />
    </Routes>
  )
}
