-- =============================================================================
-- MIGRATION: Entity Members (Compartilhamento de Entidades)
-- Date: 2026-05-29
-- Description: Adds entity_members table for multi-user entity sharing.
--              Migrates existing owners, updates my_entity_ids() helper,
--              updates entities RLS, and adds trigger for auto-owner insertion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Create entity_members table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_members (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id   uuid        NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        text        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('owner', 'admin', 'member')),
    invited_by  uuid        REFERENCES auth.users(id),
    accepted_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(entity_id, user_id)
);

CREATE INDEX IF NOT EXISTS entity_members_entity_id_idx ON public.entity_members(entity_id);
CREATE INDEX IF NOT EXISTS entity_members_user_id_idx   ON public.entity_members(user_id);

-- -----------------------------------------------------------------------------
-- STEP 2: Backfill — insert owner record for every existing entity
-- -----------------------------------------------------------------------------
INSERT INTO public.entity_members (entity_id, user_id, role, invited_by, accepted_at, created_at)
SELECT id, owner_id, 'owner', owner_id, created_at, created_at
FROM public.entities
ON CONFLICT (entity_id, user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- STEP 3: Security-definer helper functions
--         Using SECURITY DEFINER avoids RLS recursion when entity_members
--         policies reference the same table via subqueries.
-- -----------------------------------------------------------------------------

-- Returns all entity_ids the current user belongs to (accepted + pending)
CREATE OR REPLACE FUNCTION public.my_all_entity_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT entity_id FROM public.entity_members WHERE user_id = auth.uid();
$$;

-- Returns true if the current user is owner or admin of the given entity
CREATE OR REPLACE FUNCTION public.is_entity_owner_or_admin(p_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.entity_members
        WHERE entity_id   = p_entity_id
          AND user_id     = auth.uid()
          AND role        IN ('owner', 'admin')
          AND accepted_at IS NOT NULL
    );
$$;

-- Returns true if the current user is the owner of the given entity
CREATE OR REPLACE FUNCTION public.is_entity_owner(p_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.entity_members
        WHERE entity_id   = p_entity_id
          AND user_id     = auth.uid()
          AND role        = 'owner'
          AND accepted_at IS NOT NULL
    );
$$;

-- Update the shared helper used by ALL data-table RLS policies.
-- Now only returns entities where the user accepted the invitation.
CREATE OR REPLACE FUNCTION public.my_entity_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT entity_id
    FROM public.entity_members
    WHERE user_id     = auth.uid()
      AND accepted_at IS NOT NULL;
$$;

-- -----------------------------------------------------------------------------
-- STEP 4: Update entities RLS
--         SELECT: user can see any entity they are a member of (incl. pending)
--         INSERT/UPDATE/DELETE: restricted to owner (unchanged logic)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "entities_select_own" ON public.entities;

CREATE POLICY "entities_select_own"
    ON public.entities FOR SELECT
    USING (id IN (SELECT public.my_all_entity_ids()));

-- -----------------------------------------------------------------------------
-- STEP 5: Trigger — auto-insert owner in entity_members on entity creation
--         Also update the signup trigger to keep the same behaviour for new users.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_entity_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.entity_members (entity_id, user_id, role, invited_by, accepted_at)
    VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id, now())
    ON CONFLICT (entity_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_entity_created_add_owner ON public.entities;
CREATE TRIGGER on_entity_created_add_owner
    AFTER INSERT ON public.entities
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_entity_member();

-- -----------------------------------------------------------------------------
-- STEP 6: RLS on entity_members
-- -----------------------------------------------------------------------------
ALTER TABLE public.entity_members ENABLE ROW LEVEL SECURITY;

-- SELECT: see members of any entity you belong to (accepted or pending)
CREATE POLICY "entity_members_select"
    ON public.entity_members FOR SELECT
    USING (entity_id IN (SELECT public.my_all_entity_ids()));

-- INSERT: only owner or admin of the entity can add new members
CREATE POLICY "entity_members_insert"
    ON public.entity_members FOR INSERT
    WITH CHECK (public.is_entity_owner_or_admin(entity_id));

-- UPDATE (owner/admin): owner or admin can update any member record
CREATE POLICY "entity_members_update_by_admin"
    ON public.entity_members FOR UPDATE
    USING (public.is_entity_owner_or_admin(entity_id))
    WITH CHECK (public.is_entity_owner_or_admin(entity_id));

-- UPDATE (self-accept): an invited user can accept their own pending invitation
CREATE POLICY "entity_members_accept_own"
    ON public.entity_members FOR UPDATE
    USING (user_id = auth.uid() AND accepted_at IS NULL)
    WITH CHECK (user_id = auth.uid());

-- DELETE: owner can remove any member; admin can only remove plain members
CREATE POLICY "entity_members_delete"
    ON public.entity_members FOR DELETE
    USING (
        public.is_entity_owner(entity_id)
        OR (
            public.is_entity_owner_or_admin(entity_id)
            AND role = 'member'
        )
    );

-- -----------------------------------------------------------------------------
-- STEP 7: Validation
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    member_count integer;
    orphan_count integer;
BEGIN
    SELECT COUNT(*) INTO member_count FROM public.entity_members;
    SELECT COUNT(*) INTO orphan_count
    FROM public.entities e
    LEFT JOIN public.entity_members em
        ON em.entity_id = e.id AND em.user_id = e.owner_id
    WHERE em.id IS NULL;

    RAISE NOTICE 'entity_members rows: %', member_count;
    IF orphan_count > 0 THEN
        RAISE WARNING 'Entities without owner in entity_members: %', orphan_count;
    ELSE
        RAISE NOTICE 'OK: all entities have an owner record in entity_members';
    END IF;
END $$;
