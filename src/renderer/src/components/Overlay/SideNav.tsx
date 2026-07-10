import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutDashboard, Settings, Palette, Calendar, Send, ChevronRight } from 'lucide-react'
import { useConfigStore } from '../../store/useConfigStore'

type View = 'timeline' | 'settings' | 'appearance' | 'calendar' | 'submit'

type Props = {
  currentView: View
  onViewChange: (view: View) => void
}

const SPRING = { type: 'spring', stiffness: 320, damping: 32, mass: 0.8 } as const

export function SideNav({ currentView, onViewChange }: Props): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(true)
  const glassIntensity = useConfigStore((s) => s.config.glassIntensity)
  const bgOpacity = 1 - (glassIntensity / 100) * 0.8

  const navItems = [
    { id: 'timeline', label: 'Timeline', icon: LayoutDashboard },
    { id: 'settings', label: 'Work Orders', icon: Settings },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'submit', label: 'Submit', icon: Send }
  ] as const

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 56 : 200 }}
      transition={SPRING}
      className="relative flex-shrink-0 flex flex-col py-2 gap-0.5 z-20"
      style={{
        background: `rgba(17, 20, 24, ${bgOpacity.toFixed(2)})`,
        borderRight: '1px solid var(--color-border)',
        overflow: 'hidden'
      }}
    >
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = currentView === item.id

        return (
          <div key={item.id} className="relative mx-1.5">
            {isActive && (
              <motion.div
                layoutId="sidenav-pill"
                className="absolute inset-0 rounded-md"
                style={{
                  background: 'rgba(14, 165, 233, 0.1)',
                  border: '1px solid rgba(14, 165, 233, 0.2)'
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              />
            )}
            <button
              onClick={() => onViewChange(item.id as View)}
              title={collapsed ? item.label : undefined}
              className={[
                'relative flex items-center w-full rounded-md transition-colors duration-100',
                collapsed ? 'justify-center px-0 py-3' : 'gap-2.5 px-3 py-2.5',
                isActive
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/[0.04]'
              ].join(' ')}
            >
              <Icon size={15} strokeWidth={isActive ? 2 : 1.75} className="flex-shrink-0" />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="text-sm font-medium truncate whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        )
      })}

      <div className="flex-1" />

      {/* Collapse toggle */}
      <div className="mx-1.5 mb-1 border-t border-border pt-1.5">
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={[
            'flex items-center w-full rounded-md py-2 text-text-muted hover:text-text-primary',
            'hover:bg-white/[0.04] transition-colors duration-100',
            collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'
          ].join(' ')}
        >
          <motion.span
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={SPRING}
            className="flex-shrink-0 flex items-center justify-center"
          >
            <ChevronRight size={14} strokeWidth={1.75} />
          </motion.span>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="text-xs whitespace-nowrap"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  )
}
