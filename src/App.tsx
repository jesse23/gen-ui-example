import { Router, Route } from './components/react/Router'
import BreadcrumbNav from './components/react/BreadcrumbNav'
import Home from './pages/Home'
import ReactGenExample from './pages/ReactGenExample'
import DeclExample from './pages/DeclExample'
import DeclGenExample from './pages/DeclGenExample'
import { Toaster } from './components/ui/sonner'

function App() {
  return (
    <Router>
      <div className="h-screen bg-gray-50 flex flex-col">
        <BreadcrumbNav />
        <div className="flex-1 overflow-auto">
          <Route path="/" component={<Home />} />
          <Route path="/decl-gen" component={<DeclGenExample />} />
          <Route path="/react-gen" component={<ReactGenExample />} />
          <Route path="/decl" component={<DeclExample />} />
        </div>
        <Toaster />
      </div>
    </Router>
  )
}

export default App
