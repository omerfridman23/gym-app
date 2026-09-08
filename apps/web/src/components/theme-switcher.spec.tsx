// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '@/lib/theme-context'
import { ThemeSwitcher } from './theme-switcher'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('theme-ink', 'theme-ocean')
})

afterEach(cleanup)

describe('ThemeSwitcher', () => {
  it('uses compact icon-only controls with accessible names', () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    )

    const group = screen.getByRole('group', { name: 'ערכת עיצוב' })
    expect(group.className).toContain('w-fit')
    expect(group.textContent).toBe('')
    expect(
      screen
        .getByRole('button', { name: 'ערכת צבעים בהירה' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('switches to the dark palette', () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'ערכת צבעים כהה' }))
    expect(
      screen
        .getByRole('button', { name: 'ערכת צבעים כהה' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })
})
