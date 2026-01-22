import { useState, useEffect } from 'react'
import { useRouter } from './Router'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '../ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { ChevronDown, Settings } from 'lucide-react'
import { getPageMetadata, getNonHomePages } from '../../pages/pages'
import { getApiKey, setApiKey, getApiKeyFromEnvironment } from '../../services/openai'

export default function BreadcrumbNav() {
  const router = useRouter()
  const currentRoute = router.currentRoute
  const currentPage = getPageMetadata(currentRoute)
  const homePage = getPageMetadata('/')!
  const nonHomePages = getNonHomePages()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [apiKey, setApiKeyValue] = useState<string>('')

  const isHome = currentRoute === '/' || currentRoute === ''

  // Load API key from global state or environment when dialog opens
  useEffect(() => {
    if (isDialogOpen) {
      const currentKey = getApiKey() || getApiKeyFromEnvironment() || ''
      setApiKeyValue(currentKey)
    }
  }, [isDialogOpen])

  const handleSave = () => {
    setApiKey(apiKey.trim() || null)
    setIsDialogOpen(false)
  }

  return (
    <>
      <div className="border-b border-gray-200 bg-white pl-2">
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  href="#/"
                  onClick={(e) => {
                    e.preventDefault()
                    router.navigate('/')
                  }}
                  className={isHome ? 'font-semibold text-foreground' : ''}
                >
                  {homePage.title}
                </BreadcrumbLink>
              </BreadcrumbItem>
              {!isHome && currentPage && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <BreadcrumbLink
                          href="#"
                          onClick={(e) => e.preventDefault()}
                          className="flex items-center gap-1 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"
                        >
                          {currentPage.title}
                          <ChevronDown />
                          <span className="sr-only">Toggle menu</span>
                        </BreadcrumbLink>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {nonHomePages.map((page) => (
                          <DropdownMenuItem
                            key={page.path}
                            onClick={() => router.navigate(page.path)}
                          >
                            {page.title}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDialogOpen(true)}
            className="ml-auto"
            title="OpenAI API Settings"
          >
            <Settings className="h-5 w-5" />
            <span className="sr-only">Settings</span>
          </Button>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>OpenAI API Settings</DialogTitle>
            <DialogDescription>
              Enter your OpenAI API key. It will be stored in memory for this session.
              If not set, the app will use the VITE_OPENAI_API_KEY environment variable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="text"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKeyValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
