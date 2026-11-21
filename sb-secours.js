/* Secours : si jsDelivr est injoignable, on charge la bibliothèque Supabase depuis unpkg. */
if (!window.supabase) {
  document.write('<script src="https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js" crossorigin="anonymous"><\/script>');
}
