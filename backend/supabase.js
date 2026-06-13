import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Public client — in backend, we use service role to bypass RLS since backend enforces roles
export const db = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// Admin client — uses service role key, bypasses Row Level Security
export const adminDb = createClient(supabaseUrl, supabaseServiceKey);
