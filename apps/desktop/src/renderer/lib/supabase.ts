import { createRenderizadorClient } from "@renderizador/supabase";
import { env } from "./env";

export const supabase =
  env.supabaseUrl && env.supabaseAnonKey
    ? createRenderizadorClient({
        url: env.supabaseUrl,
        anonKey: env.supabaseAnonKey
      })
    : null;
