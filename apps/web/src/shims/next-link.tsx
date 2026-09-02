/**
 * Compatibility shim: the v0 UI code imports `next/link`.
 * Vite aliases that import here, so v0 files stay byte-identical
 * and future v0 pushes merge cleanly (handoff section 6).
 */
import { forwardRef, type ComponentProps } from 'react'
import { Link as RouterLink } from 'react-router'

type NextLinkProps = Omit<ComponentProps<typeof RouterLink>, 'to'> & { href: string }

const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(function Link({ href, ...rest }, ref) {
  return <RouterLink ref={ref} to={href} {...rest} />
})

export default Link
