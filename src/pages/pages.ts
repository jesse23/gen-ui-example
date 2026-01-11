export interface PageMetadata {
  path: string
  title: string
  description?: string
}

export const PAGES: Record<string, PageMetadata> = {
  '/': {
    path: '/',
    title: 'Home',
    description: 'Explore different approaches to generating UI components',
  },
  '/decl-gen': {
    path: '/decl-gen',
    title: 'DeclGen Example',
    description: 'Generate UI components using AI prompts (DECL format)',
  },
  '/react-gen': {
    path: '/react-gen',
    title: 'ReactGen Example',
    description: 'Generate UI components using AI prompts',
  },
  '/decl': {
    path: '/decl',
    title: 'DECL Example',
    description: 'Build components using YAML declarations',
  },
}

export function getPageMetadata(path: string): PageMetadata | undefined {
  return PAGES[path]
}

export function getAllPages(): PageMetadata[] {
  return Object.values(PAGES)
}

export function getNonHomePages(): PageMetadata[] {
  return Object.values(PAGES).filter(page => page.path !== '/')
}
