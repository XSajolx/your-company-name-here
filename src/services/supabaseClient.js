import { createClient } from '@supabase/supabase-js'

// Demo build: `@supabase/supabase-js` is aliased to a local mock (see vite.config.js),
// so this client needs no URL/key and talks to no backend — it returns generated
// mock data and a pre-authenticated demo session.
export const supabase = createClient()
