'use client'

import { createContext, useContext } from 'react'
import { useEntity } from '@/hooks/useEntity'
import type { Entity, EntityMemberRole } from '@/types'

interface EntityContextValue {
  entities: Entity[]
  activeEntity: Entity | null
  setActiveEntity: (entity: Entity) => void
  addEntity: (entity: Entity) => void
  updateEntity: (entity: Entity) => void
  isLoading: boolean
  activeEntityRole: EntityMemberRole | null
}

const EntityContext = createContext<EntityContextValue | null>(null)

export function EntityProvider({ children }: { children: React.ReactNode }) {
  const { memberRoles, activeEntity, ...rest } = useEntity()
  const activeEntityRole = activeEntity ? (memberRoles[activeEntity.id] ?? null) : null
  return (
    <EntityContext.Provider value={{ ...rest, activeEntity, activeEntityRole }}>
      {children}
    </EntityContext.Provider>
  )
}

export function useEntityContext(): EntityContextValue {
  const ctx = useContext(EntityContext)
  if (!ctx) throw new Error('useEntityContext must be used within EntityProvider')
  return ctx
}
