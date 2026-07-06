import * as React from "react"

// 1024 (Tailwind `lg`) so tablets (iPad portrait 768–834, etc.) get the
// touch-friendly mobile flow, not the mouse-oriented desktop canvas. Kept in
// sync with the `lg:` interface switches in MegyAssistant / Builder / InstallPrompt.
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

// True when the viewport is taller than it is wide. Used to nudge the user to
// rotate on views that need the width (e.g. the two-page Preview spread). Updates
// live on orientation change / resize.
export function useIsPortrait() {
  const [isPortrait, setIsPortrait] = React.useState<boolean>(
    typeof window !== "undefined" ? window.innerHeight >= window.innerWidth : true,
  )

  React.useEffect(() => {
    const mql = window.matchMedia("(orientation: portrait)")
    const onChange = () => setIsPortrait(window.innerHeight >= window.innerWidth)
    mql.addEventListener("change", onChange)
    window.addEventListener("resize", onChange)
    onChange()
    return () => {
      mql.removeEventListener("change", onChange)
      window.removeEventListener("resize", onChange)
    }
  }, [])

  return isPortrait
}
