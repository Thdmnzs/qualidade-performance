import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'




function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Mensagem única para qualquer falha de autenticação: sessão ausente, expirada
 * ou token adulterado. Detalhar o motivo não ajuda o usuário e ajudaria um atacante.
 */
const SESSAO_INVALIDA = 'Sua sessão expirou ou é inválida. Entre novamente.';

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    
    const SUPABASE_URL = process.env['SUPABASE_URL'];
    const SUPABASE_PUBLISHABLE_KEY = process.env['SUPABASE_PUBLISHABLE_KEY'];

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Configure-as no arquivo .env (local) ou nas Environment Variables da Vercel.`;
      console.error(`[Supabase] ${message}`);
      throw new Error(message);
    }
    
    const request = getRequest();

    if (!request?.headers) {
      throw new Error(SESSAO_INVALIDA);
    }


    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error(SESSAO_INVALIDA);
    }

    const token = authHeader.slice('Bearer '.length);
    if (token.split('.').length !== 3) {
      throw new Error(SESSAO_INVALIDA);
    }

    const supabase = createClient<Database>(
      SUPABASE_URL!,
      SUPABASE_PUBLISHABLE_KEY!,
      {
        global: {
          fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY!),
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // getClaims verifica a assinatura do token. Ela pode LANÇAR exceção (não só
    // retornar erro) quando o token está malformado; tratamos os dois casos igual.
    let claims;
    try {
      const { data, error } = await supabase.auth.getClaims(token);
      if (error || !data?.claims?.sub) throw error ?? new Error('token sem usuário');
      claims = data.claims;
    } catch {
      throw new Error(SESSAO_INVALIDA);
    }

    return next({
      context: {
        supabase,
        userId: claims.sub,
        claims,
      },
    });
  },
);
