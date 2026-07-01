// src/renderer/src/components/QuickCapture/commands.ts
// Slash command registry for the quick-capture bar.
// Add new commands here — the UI reads from COMMANDS automatically.

import type { useTaskStore as UseTaskStore } from '../../store/useTaskStore'

export type CommandContext = {
  taskStore: ReturnType<typeof UseTaskStore.getState>
  dismiss: () => void
  setValue: (v: string) => void
  recentTasks: string[]
}

export type SlashCommand = {
  name: string
  description: string
  takesArg: boolean
  execute: (arg: string, ctx: CommandContext) => void
}

export const COMMANDS: SlashCommand[] = [
  {
    name: 'reuse',
    description: 'Start a recent task by name',
    takesArg: true,
    execute: (arg, ctx) => {
      const match = ctx.recentTasks.find((r) =>
        r.toLowerCase().startsWith(arg.trim().toLowerCase()),
      )
      const title = match ?? arg.trim()
      if (!title) return
      ctx.taskStore.startTask(title)
      ctx.dismiss()
    },
  },
  {
    name: 'stop',
    description: 'Stop the current task',
    takesArg: false,
    execute: (_arg, ctx) => {
      const running = ctx.taskStore.currentTask
      if (running) ctx.taskStore.stopTask(running.id)
      ctx.dismiss()
    },
  },
  {
    name: 'note',
    description: 'Attach a note to the running task (Phase 3)',
    takesArg: true,
    execute: (_arg, ctx) => {
      // Deferred: requires TASK_ADD_NOTE IPC channel (Phase 3)
      ctx.dismiss()
    },
  },
]

/**
 * Return commands whose name starts with `prefix` (after the leading '/').
 */
export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return []
  const prefix = input.slice(1).split(' ')[0].toLowerCase()
  return COMMANDS.filter((c) => c.name.startsWith(prefix))
}

/**
 * If `input` is '/name <arg>' and 'name' matches exactly one command, return it + the arg.
 */
export function resolveCommand(input: string): { command: SlashCommand; arg: string } | null {
  if (!input.startsWith('/')) return null
  const [namePart, ...rest] = input.slice(1).split(' ')
  const command = COMMANDS.find((c) => c.name === namePart.toLowerCase())
  if (!command) return null
  return { command, arg: rest.join(' ') }
}
