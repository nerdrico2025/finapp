'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Entity } from '@/types'

const STORAGE_KEY = 'finapp_active_entity'
const COOKIE_NAME = 'finapp_entity_id'

function syncCookie(id: string) {
  document.cookie = `${COOKIE_NAME}=${id}; path=/; max-age=2592000; SameSite=Lax`
}

export function useEntity() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [activeEntity, setActiveEntityState] = useState<Entity | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setIsLoading(false); return }

      const { data } = await supabase
        .from('entities')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })

      if (!data || data.length === 0) { setIsLoading(false); return }

      const typed = data as Entity[]
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

  return { entities, activeEntity, setActiveEntity, addEntity, updateEntity, isLoading }
}
