import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[cv-reformatter] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth will fail until configured.",
  );
}

export const supabase = createClient(url || "", anonKey || "");
