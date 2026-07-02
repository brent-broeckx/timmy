// src/renderer/src/components/Settings/WorkOrderSettings.tsx
// Manage projects and work orders. Changes persist to SQLite immediately.

import { useState } from 'react'
import { useConfigStore } from '../../store/useConfigStore'
import { ipc } from '../../ipc'
import type { Project, WorkOrder } from '@shared/types'

type EditingWO = {
  projectId: string
  id: string | null // null = new
  code: string
  label: string
  description: string
}

export function WorkOrderSettings(): React.JSX.Element {
  const projects = useConfigStore((s) => s.projects)
  const reloadProjects = useConfigStore((s) => s.reloadProjects)

  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectClient, setNewProjectClient] = useState('')
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)
  const [editingWO, setEditingWO] = useState<EditingWO | null>(null)
  const [saving, setSaving] = useState(false)

  // ─── Project CRUD ──────────────────────────────────────────────────────────

  const handleAddProject = async (): Promise<void> => {
    const name = newProjectName.trim()
    const clientName = newProjectClient.trim()
    if (!name) return
    setSaving(true)
    try {
      await ipc.project.create({ name, clientName: clientName || name })
      setNewProjectName('')
      setNewProjectClient('')
      await reloadProjects()
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (p: Project): Promise<void> => {
    await ipc.project.update({ id: p.id, name: p.name, clientName: p.clientName, active: !p.active })
    await reloadProjects()
  }

  const handleDeleteProject = async (project: Project): Promise<void> => {
    if (!confirm(`Delete project "${project.name}" and all of its work orders? Assigned blocks will be unassigned.`)) return
    await ipc.project.delete(project.id)
    if (expandedProjectId === project.id) {
      setExpandedProjectId(null)
    }
    if (editingWO?.projectId === project.id) {
      setEditingWO(null)
    }
    await reloadProjects()
  }

  // ─── Work order CRUD ──────────────────────────────────────────────────────

  const startNewWO = (projectId: string): void => {
    setEditingWO({ projectId, id: null, code: '', label: '', description: '' })
  }

  const startEditWO = (projectId: string, wo: WorkOrder): void => {
    setEditingWO({ projectId, id: wo.id, code: wo.code, label: wo.label, description: wo.description })
  }

  const cancelEditWO = (): void => setEditingWO(null)

  const saveWO = async (): Promise<void> => {
    if (!editingWO) return
    const { projectId, id, code, label, description } = editingWO
    if (!code.trim() || !label.trim()) return
    setSaving(true)
    try {
      if (id) {
        const project = projects.find((p) => p.id === projectId)
        const wo = project?.workOrders.find((w) => w.id === id)
        if (wo) {
          await ipc.workorder.update({ ...wo, code: code.trim(), label: label.trim(), description: description.trim() })
        }
      } else {
        await ipc.workorder.create({
          projectId,
          code: code.trim(),
          label: label.trim(),
          description: description.trim(),
        })
      }
      setEditingWO(null)
      await reloadProjects()
    } finally {
      setSaving(false)
    }
  }

  const deleteWO = async (id: string): Promise<void> => {
    if (!confirm('Delete this work order? Blocks assigned to it will be unassigned.')) return
    await ipc.workorder.delete(id)
    await reloadProjects()
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      <h2 className="text-sm font-semibold text-text-primary">Projects & Work Orders</h2>

      {/* Add project form */}
      <div className="space-y-2 border border-border rounded-lg p-3">
        <p className="text-xs font-medium text-text-muted">New Project</p>
        <input
          type="text"
          placeholder="Project name"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          className="w-full text-xs bg-surface-elevated border border-border rounded px-2 py-1.5 text-text-primary placeholder-text-muted"
        />
        <input
          type="text"
          placeholder="Client name (optional)"
          value={newProjectClient}
          onChange={(e) => setNewProjectClient(e.target.value)}
          className="w-full text-xs bg-surface-elevated border border-border rounded px-2 py-1.5 text-text-primary placeholder-text-muted"
        />
        <button
          onClick={handleAddProject}
          disabled={!newProjectName.trim() || saving}
          className="text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
        >
          Add Project
        </button>
      </div>

      {/* Project list */}
      {projects.length === 0 && (
        <p className="text-xs text-text-muted text-center py-4">No projects yet.</p>
      )}

      {projects.map((project) => (
        <div key={project.id} className="border border-border rounded-lg overflow-hidden">
          {/* Project header */}
          <div
            className="flex items-center gap-2 px-3 py-2 bg-surface cursor-pointer hover:bg-surface-elevated transition-colors"
            onClick={() =>
              setExpandedProjectId(expandedProjectId === project.id ? null : project.id)
            }
          >
            <span className="text-xs flex-1 font-medium text-text-primary">
              {project.name}
              {project.clientName !== project.name && (
                <span className="text-text-muted font-normal"> · {project.clientName}</span>
              )}
            </span>
            <span className="text-xs text-text-muted">
              {project.workOrders.length} WO{project.workOrders.length !== 1 ? 's' : ''}
            </span>
            <span
              className={[
                'text-xs px-2 py-0.5 rounded border',
                project.active
                  ? 'text-accent border-accent/40 bg-accent/10'
                  : 'text-text-muted border-border bg-surface-elevated'
              ].join(' ')}
            >
              {project.active ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleActive(project) }}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                project.active
                  ? 'text-text-muted border-border hover:text-text-primary hover:border-border-hover'
                  : 'text-accent border-accent/40 hover:bg-accent/10'
              }`}
            >
              {project.active ? 'Set inactive' : 'Set active'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); void handleDeleteProject(project) }}
              className="text-xs px-2 py-0.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Delete
            </button>
            <span className="text-text-muted text-xs">
              {expandedProjectId === project.id ? '▲' : '▼'}
            </span>
          </div>

          {/* Work orders */}
          {expandedProjectId === project.id && (
            <div className="px-3 pb-3 space-y-2 border-t border-border">
              {project.workOrders.map((wo) => (
                <div
                  key={wo.id}
                  className="flex items-start gap-2 pt-2"
                >
                  {editingWO?.id === wo.id ? (
                    <WOEditForm
                      value={editingWO}
                      onChange={setEditingWO}
                      onSave={saveWO}
                      onCancel={cancelEditWO}
                      saving={saving}
                    />
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-text-primary">
                          {wo.code} — {wo.label}
                        </p>
                        {wo.description && (
                          <p className="text-xs text-text-muted truncate">{wo.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => startEditWO(project.id, wo)}
                        className="text-xs text-text-muted hover:text-text-primary flex-shrink-0"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteWO(wo.id)}
                        className="text-xs text-red-400 hover:text-red-300 flex-shrink-0"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              ))}

              {/* New work order form */}
              {editingWO?.projectId === project.id && editingWO.id === null ? (
                <WOEditForm
                  value={editingWO}
                  onChange={setEditingWO}
                  onSave={saveWO}
                  onCancel={cancelEditWO}
                  saving={saving}
                />
              ) : (
                <button
                  onClick={() => startNewWO(project.id)}
                  className="text-xs text-accent hover:underline mt-1"
                >
                  + Add Work Order
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Inline work order edit form ──────────────────────────────────────────────

type WOEditFormProps = {
  value: EditingWO
  onChange: (v: EditingWO) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}

function WOEditForm({ value, onChange, onSave, onCancel, saving }: WOEditFormProps): React.JSX.Element {
  const set = (field: keyof EditingWO) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
    onChange({ ...value, [field]: e.target.value })

  return (
    <div className="flex-1 space-y-1.5">
      <div className="flex gap-1.5">
        <input
          type="text"
          placeholder="Code (e.g. WO-1001)"
          value={value.code}
          onChange={set('code')}
          className="w-28 text-xs bg-surface-elevated border border-border rounded px-2 py-1 text-text-primary placeholder-text-muted"
        />
        <input
          type="text"
          placeholder="Label (e.g. Development)"
          value={value.label}
          onChange={set('label')}
          className="flex-1 text-xs bg-surface-elevated border border-border rounded px-2 py-1 text-text-primary placeholder-text-muted"
        />
      </div>
      <input
        type="text"
        placeholder="Description (used for AI routing)"
        value={value.description}
        onChange={set('description')}
        className="w-full text-xs bg-surface-elevated border border-border rounded px-2 py-1 text-text-primary placeholder-text-muted"
      />
      <div className="flex gap-1.5">
        <button
          onClick={onSave}
          disabled={!value.code.trim() || !value.label.trim() || saving}
          className="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1 rounded border border-border text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
