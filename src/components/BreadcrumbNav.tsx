import { useRouter } from './Router'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from './ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { getPageMetadata, getNonHomePages } from '../pages/pages'

export default function BreadcrumbNav() {
  const router = useRouter()
  const currentRoute = router.currentRoute
  const currentPage = getPageMetadata(currentRoute)
  const homePage = getPageMetadata('/')!
  const nonHomePages = getNonHomePages()

  const isHome = currentRoute === '/' || currentRoute === ''

  return (
    <div className="border-b border-gray-200 bg-white px-6 py-4">
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
    </div>
  )
}
