/* Kiosko KP Web — conexión a la misma base Supabase que la app Flutter.
 * Estos valores son la clave ANON pública (igual que en lib/main.dart).
 * RLS permite todo a anon (ver supabase_schema.sql), así que es seguro
 * exponerla en una página estática.
 */
window.KP_CONFIG = {
  SUPABASE_URL: "https://nvxihdyekejmgrsswpcx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_S4RIJbndYrVv6Ik8PPwL2w_Q65k-uBj",
  SYNC_MS_OK: 30000,
  SYNC_MS_FAIL: 60000,
  PAGE_SIZE: 500
};
