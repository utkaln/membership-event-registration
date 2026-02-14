import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Test Helpers
 *
 * Functions for managing test users in Supabase Auth.
 */

let supabaseAdmin: SupabaseClient;

/**
 * Get Supabase Admin client (singleton)
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables'
      );
    }

    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdmin;
}

/**
 * Create a test user in Supabase Auth
 */
export async function createTestUser(
  email: string,
  password: string
): Promise<{ userId: string; accessToken: string }> {
  const supabase = getSupabaseAdmin();

  // Create user in Supabase Auth
  const { data: authUser, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for testing
    });

  if (authError || !authUser.user) {
    throw new Error(`Failed to create test user: ${authError?.message}`);
  }

  // Sign in to get access token (createSession doesn't exist in current Supabase version)
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  return {
    userId: authUser.user.id,
    accessToken: signInData.session.access_token,
  };
}

/**
 * Delete a test user from Supabase Auth
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    console.warn(`Warning: Failed to delete test user ${userId}:`, error.message);
    // Don't throw - cleanup is best-effort
  }
}

/**
 * Get fresh access token for a user
 * Note: This requires the user's email and password since createSession doesn't exist
 */
export async function getAccessToken(
  email: string,
  password: string
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(`Failed to get access token: ${error?.message}`);
  }

  return data.session.access_token;
}

/**
 * Verify a JWT token is valid
 */
export async function verifyToken(token: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.auth.getUser(token);

  return !error && !!data.user;
}
