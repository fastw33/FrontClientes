import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, setCsrf } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const apply = useCallback((value) => {
    setCsrf(value?.csrf_token)
    setSession(value)
    return value
  }, [])
  const refresh = useCallback(async () => apply(await api.me()), [apply])

  useEffect(() => {
    const controller = new AbortController()
    api
      .me({ signal: controller.signal, notifyUnauthorized: false })
      .then((value) => {
        if (!controller.signal.aborted) apply(value)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        apply(null)
        if (error.status !== 401) setNotice(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [apply])

  useEffect(() => {
    function expired() {
      apply(null)
      setNotice('Tu sesión ha terminado. Ingresa nuevamente para continuar.')
    }
    function termsRequired() {
      refresh().catch((error) => setNotice(error.message))
    }
    window.addEventListener('fastway:session-expired', expired)
    window.addEventListener('fastway:terms-required', termsRequired)
    return () => {
      window.removeEventListener('fastway:session-expired', expired)
      window.removeEventListener('fastway:terms-required', termsRequired)
    }
  }, [apply, refresh])

  async function login(input) {
    const value = await api.login(input)
    setNotice('')
    return apply(value)
  }
  async function changePassword(input) {
    return apply(await api.changePassword(input))
  }
  async function logout() {
    await api.logout()
    apply(null)
    setNotice('')
  }

  return (
    <AuthContext.Provider
      value={{ session, loading, notice, setNotice, login, logout, refresh, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider es obligatorio.')
  return context
}
