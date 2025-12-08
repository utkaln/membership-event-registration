-- OSA Community Platform - Database Triggers
-- This file contains all database triggers as specified in prompts/02_DATABASE_SCHEMA.md
-- Apply these triggers after running Prisma migrations

-- ============================================================================
-- AUTH USER SYNC TRIGGER
-- ============================================================================
-- Automatically create a user record when someone signs up via Supabase Auth
-- This is a backup to the JIT Sync in the API

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    'GUEST',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- SEAT COUNTER TRIGGER
-- ============================================================================
-- Automatically update event.currentSeats when registrations change

CREATE OR REPLACE FUNCTION public.update_event_seat_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'CONFIRMED' THEN
      UPDATE events
      SET current_seats = current_seats + 1,
          updated_at = NOW()
      WHERE id = NEW.event_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Seat was confirmed
    IF OLD.status != 'CONFIRMED' AND NEW.status = 'CONFIRMED' THEN
      UPDATE events
      SET current_seats = current_seats + 1,
          updated_at = NOW()
      WHERE id = NEW.event_id;
    -- Seat was released
    ELSIF OLD.status = 'CONFIRMED' AND NEW.status IN ('CANCELLED', 'COMPLETED') THEN
      UPDATE events
      SET current_seats = GREATEST(current_seats - 1, 0),
          updated_at = NOW()
      WHERE id = NEW.event_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'CONFIRMED' THEN
      UPDATE events
      SET current_seats = GREATEST(current_seats - 1, 0),
          updated_at = NOW()
      WHERE id = OLD.event_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_update_event_seats ON event_registrations;

CREATE TRIGGER trg_update_event_seats
  AFTER INSERT OR UPDATE OR DELETE ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_event_seat_count();

-- ============================================================================
-- WAITLIST POSITION TRIGGER
-- ============================================================================
-- Automatically assign position when adding to waitlist

CREATE OR REPLACE FUNCTION public.assign_waitlist_position()
RETURNS TRIGGER AS $$
DECLARE
  next_position INT;
BEGIN
  SELECT COALESCE(MAX(position), 0) + 1
  INTO next_position
  FROM waitlist
  WHERE event_id = NEW.event_id
    AND status IN ('WAITING', 'OFFERED');

  NEW.position := next_position;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_assign_waitlist_position ON waitlist;

CREATE TRIGGER trg_assign_waitlist_position
  BEFORE INSERT ON waitlist
  FOR EACH ROW EXECUTE FUNCTION public.assign_waitlist_position();

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Check that all triggers are installed correctly

SELECT
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'on_auth_user_created',
    'trg_update_event_seats',
    'trg_assign_waitlist_position'
  )
ORDER BY trigger_name;
