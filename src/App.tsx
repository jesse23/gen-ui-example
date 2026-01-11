import { Router, Route } from './components/Router'
import BreadcrumbNav from './components/BreadcrumbNav'
import Home from './pages/Home'
import ReactGenExample from './pages/ReactGenExample'
import DeclExample from './pages/DeclExample'

function App() {
  return (
    <Router>
      <div className="h-screen bg-gray-50 flex flex-col">
        <BreadcrumbNav />
        <div className="flex-1 overflow-auto">
          <Route path="/" component={<Home />} />
          <Route path="/react-gen" component={<ReactGenExample />} />
          <Route path="/decl" component={<DeclExample />} />
        </div>
      </div>
    </Router>
  )
}

export default App
