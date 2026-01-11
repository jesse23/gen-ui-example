import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'

type Route = string

interface RouterContextType {
  currentRoute: Route
  navigate: (route: Route) => void
}

const RouterContext = createContext<RouterContextType | undefined>(undefined)

export function useRouter() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useRouter must be used within Router')
  }
  return context
}

interface RouterProps {
  children: ReactNode
}

export function Router({ children }: RouterProps) {
  const [currentRoute, setCurrentRoute] = useState<Route>(() => {
    // Get initial route from hash, default to '/'
    const hash = window.location.hash.slice(1) || '/'
    // If no hash is set, set it to '/'
    if (!window.location.hash) {
      window.location.hash = '/'
    }
    return hash
  })

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || '/'
      setCurrentRoute(hash)
    }

    // Set initial hash if not present
    if (!window.location.hash) {
      window.location.hash = '/'
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navigate = (route: Route) => {
    window.location.hash = route
    setCurrentRoute(route)
  }

  return (
    <RouterContext.Provider value={{ currentRoute, navigate }}>
      {children}
    </RouterContext.Provider>
  )
}

interface RouteProps {
  path: string
  component: ReactNode
}

export function Route({ path, component }: RouteProps) {
  const { currentRoute } = useRouter()
  return currentRoute === path ? <>{component}</> : null
}
