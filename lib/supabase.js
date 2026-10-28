const { createClient } = require('@supabase/supabase-js');

let client;

function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    throw Object.assign(new Error('O Supabase não está configurado nas variáveis de ambiente.'), {
      statusCode: 503,
    });
  }

  client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

module.exports = { getSupabase };
