// src/renderer/src/store/useConfigStore.ts
// App configuration (anchor position, shortcut, theme, etc.) and projects/work orders.

import { create } from 'zustand'
import { ipc } from '../ipc'
import { DEFAULT_APP_CONFIG } from '@shared/types'
import type { AppConfig, Project } from '@shared/types'

type ConfigState = {
  config: AppConfig
  projects: Project[]
  isLoaded: boolean
}

type ConfigActions = {
  load: () => Promise<void>
  updateConfig: (partial: Partial<AppConfig>) => Promise<void>
  setProjects: (projects: Project[]) => void
  reloadProjects: () => Promise<void>
}

export const useConfigStore = create<ConfigState & ConfigActions>((set, get) => ({
  config: { ...DEFAULT_APP_CONFIG },
  projects: [],
  isLoaded: false,

  load: async () => {
    try {
      const [config, projects] = await Promise.all([ipc.config.get(), ipc.project.list()])
      set({ config, projects, isLoaded: true })
    } catch (err) {
      console.error('[config] load failed:', err)
      set({ isLoaded: true }) // mark loaded so UI doesn't hang
    }
  },

  updateConfig: async (partial) => {
    const merged = { ...get().config, ...partial }
    set({ config: merged })
    try {
      await ipc.config.set(merged)
    } catch (err) {
      console.error('[config] updateConfig failed:', err)
    }
  },

  setProjects: (projects) => set({ projects }),

  reloadProjects: async () => {
    try {
      const projects = await ipc.project.list()
      set({ projects })
    } catch (err) {
      console.error('[config] reloadProjects failed:', err)
    }
  }
}))
