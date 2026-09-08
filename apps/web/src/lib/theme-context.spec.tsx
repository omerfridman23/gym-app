// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from './theme-context'

function Probe() {
  const { theme, toggleTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
      <button onClick={() => setTheme('ink')}>ink</button>
      <button onClick={() => setTheme('ocean')}>ocean</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  afterEach(() => {
    cleanup()
    localStorage.removeItem(THEME_STORAGE_KEY)
    document.documentElement.classList.remove('theme-ink', 'theme-ocean')
  })

  it('defaults to ocean and writes it on the document', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme').textContent).toBe('ocean')
    expect(document.documentElement.classList.contains('theme-ocean')).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('ocean')
  })

  it('switches to the original ink theme and back', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme').textContent).toBe('ink')
    expect(document.documentElement.classList.contains('theme-ink')).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('ink')

    fireEvent.click(screen.getByText('ocean'))
    expect(screen.getByTestId('theme').textContent).toBe('ocean')
    expect(document.documentElement.classList.contains('theme-ink')).toBe(false)
  })
})
