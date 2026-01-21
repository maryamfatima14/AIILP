// ============================================
// Supabase Client Configuration
// AIILP - Academic Industry Internship Linkage Platform
// ============================================

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = `https://llfskketkhdqetriubjc.supabase.co`;
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsZnNra2V0a2hkcWV0cml1YmpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MDEzOTMsImV4cCI6MjA4MTQ3NzM5M30.AtomcTsTl0gBcZFxsai9q7Dxs1nBmoZYkEZznj6zai8';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});

// Admin client (for server-side operations)
// Note: Use service role key in edge functions only
export const getAdminClient = (serviceRoleKey) => {
    if (!serviceRoleKey) {
        throw new Error('Service role key is required for admin operations');
    }
    return createClient(SUPABASE_URL, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
};

export default supabase;

