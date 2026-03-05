
-- Create a function to delete all user data
CREATE OR REPLACE FUNCTION delete_user_data(user_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Get user ID from auth.users
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', user_email;
  END IF;

  -- Delete from all related tables in correct order
  DELETE FROM user_roles WHERE user_id = target_user_id;
  DELETE FROM contact_activities WHERE created_by = target_user_id;
  DELETE FROM contacts WHERE created_by = target_user_id OR assigned_to = target_user_id;
  DELETE FROM org_invites WHERE invited_by = target_user_id OR used_by = target_user_id;
  DELETE FROM team_members WHERE user_id = target_user_id;
  DELETE FROM teams WHERE manager_id = target_user_id;
  DELETE FROM profiles WHERE id = target_user_id;
  
  -- Delete from auth.users (cascades will handle remaining references)
  DELETE FROM auth.users WHERE id = target_user_id;
  
  RAISE NOTICE 'Successfully deleted all data for user: %', user_email;
END;
$$;

-- Execute the deletion for gulshan@in-sync.co.in (skip if user does not exist)
DO $$
BEGIN
  PERFORM delete_user_data('gulshan@in-sync.co.in');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped: user gulshan@in-sync.co.in not found in fresh database';
END;
$$;
