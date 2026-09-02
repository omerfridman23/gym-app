/**
 * Compatibility shim: the v0 UI code imports `next/navigation`.
 * Vite aliases that import here, so v0 files stay byte-identical
 * and future v0 pushes merge cleanly (handoff section 6).
 */
import { useMemo } from 'react'
import { useLocation, useNavigate, useParams as useRouterParams } from 'react-router'

export function usePathname(): string {
  return useLocation().pathname
}

export function useParams<T extends Record<string, string | string[] | undefined>>(): T {
  return useRouterParams() as T
}

export function useRouter() {
  const navigate = useNavigate()
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, { replace: true }),
      back: () => navigate(-1),
    }),
    [navigate],
  )
}
