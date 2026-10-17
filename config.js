/*
 * Configuração em tempo de execução — edite este arquivo (também em dist/config.js após o build).
 * Deixe supabaseUrl vazio para abrir o site em MODO DEMONSTRAÇÃO (dados apenas neste navegador).
 * A chave "anon" do Supabase é pública por design; a segurança real vem das políticas RLS.
 */
window.RDS_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  // Módulo ESM do cliente Supabase carregado sob demanda (só quando supabaseUrl estiver preenchido).
  supabaseModule: 'https://esm.sh/@supabase/supabase-js@2.45.4',
  storageBucket: 'character-images',
};
