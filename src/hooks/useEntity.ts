'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Entity, EntityMemberRole } from '@/types'

const STORAGE_KEY = 'finapp_active_entity'
const COOKIE_NAME = 'finapp_entity_id'

function syncCookie(id: string) {
  document.cookie = `${COOKIE_NAME}=${id}; path=/; max-age=2592000; SameSite=Lax`
}

export function useEntity() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [activeEntity, setActiveEntityState] = useState<Entity | null>(null)
  const [memberRoles, setMemberRoles] = useState<Record<string, EntityMemberRole>>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setIsLoading(false); return }

      let typed: Entity[] | null = null

      // Primary: single query via entity_members JOIN (supports shared entities)
      const { data: raw, error: memberError } = await supabase
        .from('entity_members')
        .select('entities!entity_id(*), role')
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null)

      if (!memberError && raw?.length) {
        type Row = { entities: Entity; role: EntityMemberRole }
        const rows = raw as unknown as Row[]
        typed = rows
          .map((r) => r.entities)
          .filter(Boolean)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        const roles: Record<string, EntityMemberRole> = {}
        rows.forEach((r) => { if (r.entities?.id) roles[r.entities.id] = r.role })
        setMemberRoles(roles)
      }

      // Fallback: direct owner_id query (migration not yet applied)
      if (!typed?.length) {
        const { data: fallback } = await supabase
          .from('entities')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
        typed = (fallback as Entity[]) ?? null
        if (typed?.length) {
          const roles: Record<string, EntityMemberRole> = {}
          typed.forEach((e) => { roles[e.id] = 'owner' })
          setMemberRoles(roles)
        }
      }

      if (!typed?.length) { setIsLoading(false); return }
      setEntities(typed)

      const storedId = localStorage.getItem(STORAGE_KEY)
      const stored = storedId ? typed.find((e) => e.id === storedId) : null
      const personal = typed.find((e) => e.type === 'personal') ?? typed[0]
      const active = stored ?? personal

      setActiveEntityState(active)
      syncCookie(active.id)
      localStorage.setItem(STORAGE_KEY, active.id)
      setIsLoading(false)
    }

    load()
  }, [])

  const setActiveEntity = useCallback((entity: Entity) => {
    setActiveEntityState(entity)
    localStorage.setItem(STORAGE_KEY, entity.id)
    syncCookie(entity.id)
  }, [])

  const addEntity = useCallback((entity: Entity) => {
    setEntities((prev: Entity[]) => [...prev, entity])
  }, [])

  const updateEntity = useCallback((updated: Entity) => {
    setEntities((prev: Entity[]) => prev.map((e: Entity) => e.id === updated.id ? updated : e))
    setActiveEntityState((prev: Entity | null) => prev?.id === updated.id ? updated : prev)
  }, [])

  return { entities, activeEntity, setActiveEntity, addEntity, updateEntity, isLoading, memberRoles }
}
