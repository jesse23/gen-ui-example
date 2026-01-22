import { useRouter } from '../components/react/Router'
import { Card } from '../components/ui/card'
import { getPageMetadata, getNonHomePages } from './pages'

export const pageMetadata = getPageMetadata('/')!

export default function Home() {
  const router = useRouter()
  const pages = getNonHomePages()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{pageMetadata.title}</h1>
          <p className="text-lg text-gray-600">
            {pageMetadata.description}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {pages.map((page) => {
            const isGenUI = page.path === '/react-gen' || page.path === '/decl-gen'
            const iconBg = isGenUI ? 'bg-blue-100' : 'bg-green-100'
            const iconText = isGenUI ? 'text-blue-600' : 'text-green-600'
            const linkColor = isGenUI ? 'text-blue-600' : 'text-green-600'
            
            return (
              <Card 
                key={page.path}
                className="p-6 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => router.navigate(page.path)}
              >
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 ${iconBg} rounded-lg flex items-center justify-center`}>
                      {isGenUI ? (
                        <svg className={`w-6 h-6 ${iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      ) : (
                        <svg className={`w-6 h-6 ${iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">{page.title}</h2>
                    <p className="text-gray-600 mb-4">
                      {page.description}
                    </p>
                    <div className={`text-sm ${linkColor} font-medium`}>
                      View Demo →
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        <div className="mt-12 p-6 bg-white rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">About</h3>
          <p className="text-gray-600">
            This application demonstrates two different approaches to generating UI components:
          </p>
          <ul className="mt-4 space-y-2 text-gray-600 list-disc list-inside">
            {pages.map((page) => (
              <li key={page.path}>
                <strong>{page.title}:</strong> {page.description}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
