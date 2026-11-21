/* =====================================================================
   Mbootaay — application (V1)
   Conçu et développé par Julien D Y LUKOS
   Toutes les écritures passent par des fonctions sécurisées côté serveur.
   ===================================================================== */
(function () {
  "use strict";
  var C = window.MB_CONFIG;
  var app = document.getElementById("app");
  var topnav = document.getElementById("topnav");
  var bottomnav = document.getElementById("bottomnav");

  if (!window.supabase || !window.supabase.createClient) {
    app.innerHTML = '<div class="card center stack"><h2>Connexion impossible</h2><p class="muted">Le service n\'a pas pu être chargé. Vérifie ta connexion internet puis recharge la page.</p><button class="btn btn-gold" data-act="reload">Recharger</button></div>';
    document.addEventListener("click", function (e) { if (e.target.closest("[data-act=reload]")) location.reload(); });
    return;
  }
  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

  /* ---------------- Outils ---------------- */
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"'`]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]; }); }
  function fcfa(n) { n = Number(n || 0); return n.toLocaleString("fr-FR").replace(/ | /g, " ") + " F"; }
  function dt(d) { if (!d) return "—"; var x = new Date(d); return x.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }
  function dtt(d) { if (!d) return "—"; var x = new Date(d); return x.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " " + x.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }
  function daysLeft(d) { return Math.ceil((new Date(d) - new Date()) / 86400000); }
  function digits(s) { var d = String(s || "").replace(/\D/g, ""); if (d.length === 12 && d.indexOf("221") === 0) d = d.slice(3); return d; }
  function validPhone(s) { return /^7[0-8]\d{7}$/.test(digits(s)); }
  function showPhone(p) { if (!p) return "masqué"; var d = digits(p); return d.length === 9 ? d.slice(0, 2) + " " + d.slice(2, 5) + " " + d.slice(5, 7) + " " + d.slice(7) : p; }
  function initials(f, l) { return (String(f || "?").charAt(0) + String(l || "").charAt(0)).toUpperCase(); }
  function thisMonth() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  function periodLabel(p) {
    if (!p) return "";
    var m = /^(\d{4})-(\d{2})$/.exec(p);
    if (m) return new Date(+m[1], +m[2] - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return p;
  }
  function errText(e) {
    var m = (e && (e.message || e.error_description)) || String(e || "Erreur inconnue");
    if (/Invalid login credentials/i.test(m)) return "Numéro ou mot de passe incorrect.";
    if (/already registered|already exists/i.test(m)) return "Ce numéro a déjà un compte. Connecte-toi.";
    if (/Email not confirmed/i.test(m)) return "Compte pas encore activé. Contacte l'assistance Mbootaay.";
    if (/Password should be at least/i.test(m)) return "Le mot de passe doit contenir au moins 8 caractères.";
    if (/rate limit|too many/i.test(m)) return "Trop de tentatives. Patiente quelques minutes.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Pas de connexion internet. Réessaie.";
    if (/JWT|not authenticated|Connexion requise/i.test(m)) return "Ta session a expiré. Reconnecte-toi.";
    if (/duplicate key.*profiles_phone/i.test(m)) return "Ce numéro a déjà un compte. Connecte-toi.";
    if (/Database error saving new user/i.test(m)) return "Inscription refusée : vérifie ton numéro de téléphone.";
    return m.replace(/^.*?ERROR:\s*/, "");
  }
  function toast(msg, kind) {
    var t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.textContent = msg;
    document.getElementById("toasts").appendChild(t);
    setTimeout(function () { t.remove(); }, kind === "err" ? 5200 : 3200);
  }
  async function rpc(name, args) {
    var r = await sb.rpc(name, args || {});
    if (r.error) throw r.error;
    return r.data;
  }
  async function q(promise) { var r = await promise; if (r.error) throw r.error; return r.data; }
  function loading() { app.innerHTML = '<div class="center-load"><div class="spinner"></div><span>Chargement…</span></div>'; }
  function lockBtn(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = label || "Patiente…"; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }

  var ICON = {
    eye: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7c1.9 0 3.6-.6 5-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>',
    home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    pay: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h4"/></svg>',
    cash: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
    people: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17 14.5c2.4 0 4 1.5 4.6 4"/></svg>',
    bell: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/></svg>',
    shield: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    share: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7 8l5-5 5 5"/></svg>',
    camera: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0E7A5F" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
  };

  var TYPES = {
    tontine: { label: "Tontine", color: "#0E7A5F", lip: "#075442" },
    amicale: { label: "Amicale", color: "#2F6FDB", lip: "#1C4A9C" },
    dahira: { label: "Dahira", color: "#7A4FD1", lip: "#53329A" },
    chorale: { label: "Chorale", color: "#E0603A", lip: "#A63F1F" },
    association: { label: "Association", color: "#D49A1F", lip: "#956A0F" },
    gie: { label: "GIE", color: "#B98612", lip: "#7F5B08" },
    groupement_femmes: { label: "Groupement de femmes", color: "#C2417A", lip: "#8A2754" },
    autre: { label: "Autre groupe", color: "#4B5E58", lip: "#2E3D38" }
  };
  var ROLES = { proprietaire: "Propriétaire", president: "Président(e)", tresorier: "Trésorier(e)", secretaire: "Secrétaire", membre: "Membre" };
  var PERIODS = { hebdomadaire: "par semaine", mensuelle: "par mois", trimestrielle: "par trimestre", annuelle: "par an", libre: "montant libre" };
  var KINDS = { solde_initial: "Solde de départ", cotisation: "Cotisation", entree: "Autre entrée", sortie: "Dépense", tour: "Tour versé", aide: "Aide / soutien", annulation: "Annulation" };
  var METHODS = { wave: "Wave", orange_money: "Orange Money", especes: "Espèces", autre: "Autre" };
  var STATES = {
    preparation: ["b-grey", "En préparation"], essai: ["b-warn", "Essai gratuit"], actif: ["b-ok", "Actif"], lecture_seule: ["b-bad", "Lecture seule"], suspendu: ["b-bad", "Suspendu"]
  };
  function stateBadge(s) { var x = STATES[s] || ["b-grey", s || "—"]; return '<span class="badge ' + x[0] + '">' + esc(x[1]) + "</span>"; }
  function gState(g) {
    if (g.is_suspended) return "suspendu";
    if (!g.launched_at) return "preparation";
    if (g.paid_until && new Date(g.paid_until) > new Date()) return "actif";
    if (new Date(g.trial_ends_at) > new Date()) return "essai";
    return "lecture_seule";
  }
  function typeOf(t) { return TYPES[t] || TYPES.autre; }

  function pwField(id, label, auto) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><div class="pw"><input id="' + id + '" type="password" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-act="eye" data-for="' + id + '" aria-label="Afficher le mot de passe">' + ICON.eye + "</button></div></div>";
  }

  /* ---------------- État ---------------- */
  var S = { session: null, me: null, owner: false, settings: {}, plans: [], g: null };

  async function loadSettings() {
    try {
      var rows = await q(sb.from("platform_settings").select("key,value"));
      S.settings = {};
      rows.forEach(function (r) { S.settings[r.key] = r.value; });
    } catch (e) { /* pas bloquant */ }
  }
  async function loadPlans() {
    try { S.plans = await q(sb.from("plans").select("*").order("position")); } catch (e) { S.plans = []; }
  }
  async function loadMe() {
    var s = await sb.auth.getSession();
    S.session = s.data.session;
    S.me = null; S.owner = false;
    if (!S.session) return;
    try {
      S.me = await q(sb.from("profiles").select("*").eq("id", S.session.user.id).maybeSingle());
      S.owner = !!(S.me && S.me.is_platform_owner && !S.me.is_blocked);
    } catch (e) { S.me = null; }
  }

  /* ---------------- Navigation ---------------- */
  function setTopnav(route) {
    if (!S.session) {
      topnav.innerHTML = '<a href="#/aide" class="hide-m ' + (route === "aide" ? "on" : "") + '">Aide</a><a href="#/connexion" class="' + (route === "connexion" ? "on" : "") + '">Connexion</a><a href="#/inscription" class="hide-m ' + (route === "inscription" ? "on" : "") + '">Créer un compte</a>';
      return;
    }
    var h = '<a href="#/" class="hide-m ' + (route === "home" ? "on" : "") + '">Mes groupes</a>';
    if (S.owner) h += '<a href="#/console" class="' + (route === "console" ? "on" : "") + '">Console</a>';
    h += '<a href="#/aide" class="hide-m ' + (route === "aide" ? "on" : "") + '">Aide</a>';
    h += '<a href="#/profil" class="' + (route === "profil" ? "on" : "") + '" aria-label="Mon compte">' + esc(S.me ? S.me.first_name : "Compte") + "</a>";
    topnav.innerHTML = h;
  }
  function setBottom(gid, sub, g) {
    if (!gid) { bottomnav.classList.remove("show"); bottomnav.innerHTML = ""; return; }
    var bureau = g && ["proprietaire", "president", "tresorier", "secretaire"].indexOf(g.role) >= 0;
    var items;
    if (g && g.state === "preparation") items = [["lancement", "Préparation", ICON.home], ["membres", "Membres", ICON.people], ["caisse", "Caisse", ICON.cash], ["reglages", "Réglages", ICON.gear]];
    else {
      items = [["accueil", "Accueil", ICON.home], ["payer", "Payer", ICON.pay], ["caisse", "Caisse", ICON.cash], ["membres", "Membres", ICON.people], ["annonces", "Annonces", ICON.bell]];
      if (bureau) items.push(["bureau", "Bureau", ICON.shield]);
    }
    bottomnav.innerHTML = items.map(function (it) {
      var badge = "";
      if (it[0] === "bureau" && g && g.todo > 0) badge = '<span class="nb">' + (g.todo > 99 ? "99+" : g.todo) + "</span>";
      return '<a href="#/g/' + gid + "/" + it[0] + '" class="' + (sub === it[0] ? "on" : "") + '">' + it[2] + "<span>" + it[1] + "</span>" + badge + "</a>";
    }).join("");
    bottomnav.classList.add("show");
  }

  async function route() {
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    var r = parts[0] || "";
    window.scrollTo(0, 0);

    if (r === "invitation" && parts[1]) { setBottom(null); setTopnav(""); return viewInvite(parts[1].replace(/[^A-Za-z0-9_=-]/g, "").slice(0, 80)); }
    if (r === "reinitialiser" && parts[1]) { setBottom(null); setTopnav(""); return viewReset(parts[1].replace(/[^A-Za-z0-9_=-]/g, "").slice(0, 80)); }
    if (r === "aide") { setBottom(null); setTopnav("aide"); return viewHelp(); }
    if (r === "rejoindre" && parts[1]) {
      var code = parts[1].toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 8);
      try { localStorage.setItem("mb_join", code); } catch (e) { /* stockage indisponible */ }
      if (!S.session) { location.hash = "#/inscription"; return; }
      return viewJoin(code);
    }
    if (!S.session) {
      setBottom(null);
      if (r === "connexion") { setTopnav("connexion"); return viewLogin(); }
      if (r === "inscription") { setTopnav("inscription"); return viewSignup(); }
      setTopnav("pub"); return viewPublic();
    }
    if (!S.me) { setBottom(null); setTopnav(""); return viewNoProfile(); }
    if (S.me.is_blocked) { setBottom(null); setTopnav(""); app.innerHTML = '<div class="card center stack"><h2>Compte bloqué</h2><p class="muted">Contacte l\'assistance Mbootaay.</p><button class="btn btn-light" data-act="logout">Se déconnecter</button></div>'; return; }

    var pending = null;
    try { pending = localStorage.getItem("mb_join"); } catch (e) { pending = null; }
    if (pending && r !== "rejoindre") { location.hash = "#/rejoindre/" + pending; return; }

    if (r === "g" && parts[1]) return viewGroup(parts[1], parts[2] || "accueil");
    setBottom(null);
    if (r === "creer") { setTopnav("home"); return viewCreate(); }
    if (r === "rejoindre") { setTopnav("home"); return viewJoin(""); }
    if (r === "profil") { setTopnav("profil"); return viewProfile(); }
    if (r === "console" && S.owner) { setTopnav("console"); return viewConsole(parts[1] || "tableau"); }
    setTopnav("home");
    return viewHome();
  }

  /* ---------------- Pages publiques ---------------- */
  function viewPublic() {
    var trial = Number(S.settings.trial_days || 15);
    var types = ["tontine", "amicale", "dahira", "chorale", "association", "groupement_femmes", "gie", "autre"];
    var plans = S.plans.map(function (p, i) {
      return '<div class="plan ' + (i === 1 ? "hl" : "") + '"><h3>' + esc(p.name) + '</h3><div class="price">' + fcfa(p.price_month) + '<small style="font-size:1rem;font-weight:600"> / mois</small></div>' +
        "<p>Jusqu'à <b>" + esc(p.max_members) + " membres</b><br>ou " + fcfa(p.price_year) + " par an</p></div>";
    }).join("");
    app.innerHTML =
      '<div class="stack">' +
      '<section class="pub-hero"><div style="flex:1 1 320px" class="stack">' +
      '<span class="badge b-white">Tontines · amicales · dahiras · chorales</span>' +
      "<h1>La caisse de ton groupe, <span>claire pour tous.</span></h1>" +
      "<p>Chaque membre voit ce qu'il a versé et le solde du groupe. Le trésorier valide les paiements en un geste. Rien ne peut être effacé en cachette.</p>" +
      '<div class="row"><a class="btn btn-gold" href="#/inscription">Commencer gratuitement</a><a class="btn btn-light" href="#/connexion">Se connecter</a></div>' +
      '<p class="small" style="margin:0">' + trial + " jours d'essai gratuit, sans engagement.</p></div></section>" +
      '<section class="stack"><h2>Pour tous les groupes</h2><div class="types">' +
      types.map(function (t) { var x = typeOf(t); return '<div class="tcard"><div class="tico" style="background:' + x.color + ";box-shadow:0 4px 0 " + x.lip + '">' + ICON.people + "</div><b>" + esc(x.label) + "</b></div>"; }).join("") +
      "</div></section>" +
      '<section class="grid2">' +
      '<div class="card stack"><h3>1. Le responsable prépare le groupe</h3><p class="muted" style="margin:0">Type, cotisation, numéros de paiement, bureau et liste des membres, guidé étape par étape.</p></div>' +
      '<div class="card stack"><h3>2. Chaque membre reçoit son lien personnel</h3><p class="muted" style="margin:0">Par WhatsApp. Son nom est déjà rempli : il choisit son mot de passe et il est dedans. Les membres sans smartphone sont suivis quand même.</p></div>' +
      '<div class="card stack"><h3>3. Chacun paie et envoie sa capture</h3><p class="muted" style="margin:0">Le trésorier vérifie et valide : la caisse se met à jour pour tout le monde.</p></div>' +
      '<div class="card stack"><h3>4. Tout reste écrit</h3><p class="muted" style="margin:0">Une erreur se corrige par une annulation visible, jamais par un effacement.</p></div>' +
      "</section>" +
      (plans ? '<section class="stack"><h2>Tarifs par groupe</h2><p class="muted" style="margin:0">Les membres n\'ont rien à payer à Mbootaay : seul le groupe s\'abonne.</p><div class="plans">' + plans + "</div></section>" : "") +
      "</div>";
  }

  function viewLogin() {
    app.innerHTML = '<div class="card stack" style="max-width:460px;margin:10px auto"><h1>Connexion</h1>' +
      '<form id="f-login" class="stack" novalidate>' +
      '<div class="field"><label for="l-phone">Numéro de téléphone</label><input id="l-phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="77 123 45 67" required></div>' +
      pwField("l-pass", "Mot de passe", "current-password") +
      '<div id="l-msg"></div><button class="btn btn-gold btn-block" type="submit">Se connecter</button></form>' +
      '<p class="center small muted" style="margin:0">Pas encore de compte ? <a href="#/inscription">Créer un compte</a></p>' +
      '<p class="center small muted" style="margin:0">Mot de passe oublié ? Demande à ton président un lien pour en choisir un nouveau, ou contacte l\'assistance' + supportLink() + ".</p></div>";
  }
  function supportLink() {
    var w = S.settings.support_whatsapp;
    if (!w) return "";
    return ' sur <a href="https://wa.me/' + esc(String(w).replace(/\D/g, "")) + '" target="_blank" rel="noopener">WhatsApp</a>';
  }
  function viewSignup() {
    var pend = null; try { pend = localStorage.getItem("mb_join"); } catch (e) { pend = null; }
    app.innerHTML = '<div class="card stack" style="max-width:500px;margin:10px auto"><h1>Créer mon compte</h1>' +
      (pend ? "" : '<div class="msg info">Ton groupe t\'a envoyé un <b>lien personnel</b> sur WhatsApp ? Ouvre plutôt ce lien : ton nom y est déjà rempli.</div>') +
      (pend ? '<div class="msg info">Après ton inscription, ta demande pour rejoindre le groupe sera envoyée automatiquement.</div>' : "") +
      '<form id="f-signup" class="stack" novalidate>' +
      '<div class="grid2" style="gap:12px"><div class="field"><label for="s-first">Prénom</label><input id="s-first" type="text" autocomplete="given-name" maxlength="60" required></div>' +
      '<div class="field"><label for="s-last">Nom</label><input id="s-last" type="text" autocomplete="family-name" maxlength="60" required></div></div>' +
      '<div class="field"><label for="s-phone">Numéro de téléphone</label><input id="s-phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="77 123 45 67" required><small>Ton numéro sert d\'identifiant de connexion.</small></div>' +
      pwField("s-pass", "Mot de passe (8 caractères minimum)", "new-password") +
      pwField("s-pass2", "Confirme le mot de passe", "new-password") +
      '<div id="s-msg"></div><button class="btn btn-gold btn-block" type="submit">Créer mon compte</button></form>' +
      '<p class="center small muted" style="margin:0">Déjà inscrit ? <a href="#/connexion">Se connecter</a></p></div>';
  }
  function viewNoProfile() {
    app.innerHTML = '<div class="card center stack" style="max-width:460px;margin:10px auto"><h2>Profil introuvable</h2><p class="muted">Ton compte existe mais son profil n\'a pas été trouvé. Reconnecte-toi ou contacte l\'assistance.</p><button class="btn btn-light" data-act="logout">Se déconnecter</button></div>';
  }

  /* ---------------- Mes groupes ---------------- */
  async function viewHome() {
    loading();
    var rows;
    try { rows = await rpc("my_groups"); } catch (e) { app.innerHTML = '<div class="msg err">' + esc(errText(e)) + "</div>"; return; }
    var active = rows.filter(function (g) { return g.status === "actif"; });
    var waiting = rows.filter(function (g) { return g.status === "en_attente"; });
    var cards = active.map(function (g) {
      var t = typeOf(g.type);
      var prep = g.state === "preparation";
      return '<a class="gcard" href="#/g/' + esc(g.group_id) + (prep ? "/lancement" : "") + '" style="background:linear-gradient(150deg,' + t.color + "," + t.lip + ");box-shadow:0 8px 0 " + t.lip + ',0 16px 28px rgba(16,35,28,.14)">' +
        '<div class="gtop"><span class="badge b-white">' + esc(t.label) + "</span>" + (Number(g.pending_proofs) > 0 ? '<span class="badge" style="background:#fff;color:' + t.lip + '">' + esc(g.pending_proofs) + " à valider</span>" : "") +
        (prep ? '<span class="badge" style="background:var(--gold);color:var(--navy)">En préparation</span>' : "") + "</div>" +
        '<div class="gname">' + esc(g.name) + "</div>" +
        (prep ? '<div class="gmeta"><span>' + esc(g.members) + " membre(s) inscrit(s)</span><span><b>Continuer la préparation →</b></span></div>" :
          '<div class="gmeta"><span>Solde : <b>' + fcfa(g.balance) + "</b></span><span>" + esc(g.members) + " membres · " + esc(ROLES[g.role] || g.role) + "</span></div>" +
          (g.state !== "actif" ? '<div class="gmeta"><span>' + esc((STATES[g.state] || ["", g.state])[1]) + "</span></div>" : "")) +
        "</a>";
    }).join("");
    var wait = waiting.map(function (g) {
      return '<div class="item"><div class="grow"><b>' + esc(g.name) + '</b><span class="small muted">Demande envoyée, en attente du bureau</span></div><span class="badge b-warn">En attente</span></div>';
    }).join("");
    if (!active.length) {
      app.innerHTML = '<div class="stack" style="max-width:640px;margin:0 auto">' +
        '<div><p class="muted" style="margin:0">Bienvenue ' + esc(S.me.first_name) + ",</p><h1>Ton espace Mbootaay</h1></div>" +
        '<section class="hero-g stack"><h2 style="color:#fff">Tu attends une invitation ?</h2>' +
        '<p style="margin:0;color:#E3F6EE">Le bureau de ta tontine, amicale ou dahira t\'envoie un <b>lien personnel</b> sur WhatsApp. Ouvre-le : tu entreras directement dans ton groupe.</p>' +
        '<p style="margin:0;color:#CFEFE2" class="small">Tu n\'as rien reçu ? Demande au président ou au secrétaire de t\'ajouter avec ton numéro <b>' + esc(showPhone(S.me.phone)) + "</b>.</p></section>" +
        (wait ? '<div class="card stack"><h3>Demandes en cours</h3><div class="list">' + wait + "</div></div>" : "") +
        '<div class="card stack"><h3>On t\'a donné un code de groupe ?</h3><p class="small muted" style="margin:0">Certains groupes utilisent un code à 8 caractères.</p><a class="btn btn-light" href="#/rejoindre">Entrer un code</a></div>' +
        '<div class="card stack" style="border:2px dashed var(--line);box-shadow:none"><h3>Tu es responsable d\'un groupe ?</h3><p class="small muted" style="margin:0">Président, trésorier ou organisateur : ouvre l\'espace de ton groupe et invite tes membres.</p><a class="btn btn-green" href="#/creer">Ouvrir l\'espace de mon groupe</a></div>' +
        '<p class="center small"><a href="#/aide">Comment ça marche ?</a></p></div>';
      return;
    }
    app.innerHTML = '<div class="stack">' +
      '<div class="row" style="justify-content:space-between"><div><p class="muted" style="margin:0">Bonjour ' + esc(S.me.first_name) + ',</p><h1>Mes groupes</h1></div>' +
      '<div class="row"><a class="btn btn-light btn-sm" href="#/rejoindre">J\'ai un code</a><a class="btn btn-light btn-sm" href="#/creer">' + ICON.plus + " Ouvrir un espace</a></div></div>" +
      '<div class="grid2">' + cards + "</div>" +
      (wait ? '<div class="card stack"><h3>Demandes en cours</h3><div class="list">' + wait + "</div></div>" : "") +
      "</div>";
  }

  /* Assistant « Ouvrir l'espace de mon groupe » (étapes 0 à 3 ; 4 et 5 dans la page de préparation) */
  var W = null;
  function wizardReset() { W = { step: 0, type: "tontine", name: "", amount: "", period: "mensuelle", wave: "", om: "", ok: false }; }
  function steps(n) {
    var labels = ["Le groupe", "La cotisation", "Les paiements", "Le bureau", "Les membres"];
    return '<ol class="steps">' + labels.map(function (l, i) { return '<li class="' + (i + 1 < n ? "done" : i + 1 === n ? "on" : "") + '"><span>' + (i + 1 < n ? "✓" : i + 1) + "</span>" + l + "</li>"; }).join("") + "</ol>";
  }
  function viewCreate() {
    if (!W) wizardReset();
    var body = "";
    var trial = Number(S.settings.trial_days || 15);
    if (W.step === 0) {
      body = '<div class="card stack"><h2>Ouvrir l\'espace de ton groupe</h2>' +
        '<p class="muted" style="margin:0">Cet espace est réservé au <b>responsable</b> du groupe (président, trésorier ou organisateur).</p>' +
        '<div class="list"><div class="item"><div class="avatar">1</div><div class="grow"><b>Tu deviens propriétaire de l\'espace</b><span class="small muted">Tu nommes le bureau, tu ajoutes les membres et tu es responsable de la caisse.</span></div></div>' +
        '<div class="item"><div class="avatar">2</div><div class="grow"><b>' + trial + ' jours gratuits après le lancement</b><span class="small muted">Ensuite, le groupe choisit une formule. Les membres ne paient rien à Mbootaay.</span></div></div>' +
        '<div class="item"><div class="avatar" style="background:var(--gold);color:var(--navy)">!</div><div class="grow"><b>Tu veux seulement rejoindre ton groupe ?</b><span class="small muted">N\'ouvre pas d\'espace : demande ton lien personnel au bureau de ton groupe.</span></div></div></div>' +
        '<label class="row" style="gap:10px;font-weight:700"><input id="w-ok" type="checkbox" style="width:24px;height:24px"' + (W.ok ? " checked" : "") + "> Je suis responsable de ce groupe</label>" +
        '<div id="w-msg"></div><div class="row"><a class="btn btn-light" href="#/">Annuler</a><button class="btn btn-gold" data-act="wiz-next">Commencer</button></div></div>';
    } else if (W.step === 1) {
      body = steps(1) + '<div class="card stack"><div class="field"><label>Type de groupe</label><div class="choice" data-group="type">' +
        Object.keys(TYPES).map(function (k) { return '<button type="button" data-act="pick" data-name="type" data-val="' + k + '" class="' + (W.type === k ? "on" : "") + '">' + esc(TYPES[k].label) + "</button>"; }).join("") +
        '</div><input type="hidden" id="c-type" value="' + esc(W.type) + '"></div>' +
        '<div class="field"><label for="w-name">Nom du groupe</label><input id="w-name" type="text" maxlength="80" placeholder="Ex. Tontine des femmes de Pikine" value="' + esc(W.name) + '"></div>' +
        '<div id="w-msg"></div><div class="row"><button class="btn btn-light" data-act="wiz-back">Retour</button><button class="btn btn-gold" data-act="wiz-next">Continuer</button></div></div>';
    } else if (W.step === 2) {
      body = steps(2) + '<div class="card stack"><div class="field"><label for="w-amount">Montant de la cotisation (F CFA)</label><input id="w-amount" type="number" inputmode="numeric" min="100" step="100" placeholder="10000" value="' + esc(W.amount) + '"><small>Laisse vide si chacun donne librement.</small></div>' +
        '<div class="field"><label for="w-period">Fréquence</label><select id="w-period">' + Object.keys(PERIODS).map(function (k) { return '<option value="' + k + '"' + (k === W.period ? " selected" : "") + ">" + esc(PERIODS[k]) + "</option>"; }).join("") + "</select></div>" +
        '<div id="w-msg"></div><div class="row"><button class="btn btn-light" data-act="wiz-back">Retour</button><button class="btn btn-gold" data-act="wiz-next">Continuer</button></div></div>';
    } else {
      body = steps(3) + '<div class="card stack"><p class="muted" style="margin:0">Sur quels numéros les membres paient-ils ? Tout changement sera annoncé automatiquement à tous les membres.</p>' +
        '<div class="field"><label for="w-wave">Numéro Wave du groupe</label><input id="w-wave" type="tel" inputmode="numeric" placeholder="77 123 45 67" value="' + esc(W.wave) + '"></div>' +
        '<div class="field"><label for="w-om">Numéro Orange Money (facultatif)</label><input id="w-om" type="tel" inputmode="numeric" placeholder="77 123 45 67" value="' + esc(W.om) + '"></div>' +
        '<div class="msg info">Après cette étape, ton espace est créé <b>en préparation</b> : personne ne le voit encore. Tu ajoutes ensuite le bureau et les membres, puis tu lances le groupe.</div>' +
        '<div id="w-msg"></div><div class="row"><button class="btn btn-light" data-act="wiz-back">Retour</button><button class="btn btn-gold" data-act="wiz-create">Créer l\'espace</button></div></div>';
    }
    app.innerHTML = '<div class="stack" style="max-width:640px;margin:0 auto"><div class="pagehead"><a class="back" href="#/" aria-label="Retour">' + ICON.back + "</a><h1>Ouvrir un espace</h1></div>" + body + "</div>";
  }
  function wizardRead() {
    if (!W) return;
    if (document.getElementById("w-name")) W.name = val("w-name");
    if (document.getElementById("c-type")) W.type = val("c-type");
    if (document.getElementById("w-amount")) W.amount = val("w-amount");
    if (document.getElementById("w-period")) W.period = val("w-period");
    if (document.getElementById("w-wave")) W.wave = val("w-wave");
    if (document.getElementById("w-om")) W.om = val("w-om");
    if (document.getElementById("w-ok")) W.ok = document.getElementById("w-ok").checked;
  }
  function wizardCheck() {
    if (W.step === 0 && !W.ok) return "Coche « Je suis responsable de ce groupe » pour continuer.";
    if (W.step === 1 && W.name.length < 3) return "Le nom du groupe doit contenir au moins 3 caractères.";
    if (W.step === 2 && W.amount && !(Number(W.amount) >= 100)) return "La cotisation doit être d'au moins 100 F.";
    if (W.step === 3) {
      if (W.wave && !validPhone(W.wave)) return "Numéro Wave invalide.";
      if (W.om && !validPhone(W.om)) return "Numéro Orange Money invalide.";
    }
    return "";
  }

  /* ---------------- Invitation personnelle ---------------- */
  async function viewInvite(token) {
    loading();
    var p;
    try { p = await rpc("invitation_preview", { p_token: token }); } catch (e) { app.innerHTML = '<div class="msg err">' + esc(errText(e)) + "</div>"; return; }
    if (!p || !p.valid) {
      var why = { utilisee: "Ce lien a déjà été utilisé.", expiree: "Ce lien a expiré (validité : 7 jours).", remplacee: "Un nouveau lien t'a été envoyé : utilise le plus récent." }[p && p.reason] || "Ce lien n'est pas valable.";
      app.innerHTML = '<div class="card center stack" style="max-width:480px;margin:10px auto"><h2>Invitation indisponible</h2><p class="muted">' + esc(why) + " Demande un nouveau lien au bureau de ton groupe.</p>" +
        (S.session ? '<a class="btn btn-light" href="#/">Mes groupes</a>' : '<a class="btn btn-light" href="#/connexion">Se connecter</a>') + "</div>";
      return;
    }
    S.inv = { token: token, p: p };
    var t = typeOf(p.group_type);
    var top = '<section class="hero-g stack" style="background:linear-gradient(150deg,' + t.color + "," + t.lip + ");box-shadow:0 9px 0 " + t.lip + '"><span class="badge b-white">' + esc(t.label) + '</span><h1 style="color:#fff">' + esc(p.group_name) + '</h1><p style="margin:0;color:#fff">Tu es invité(e) comme <b>' + esc(p.first_name + " " + p.last_name) + "</b>.</p></section>";
    var body;
    if (S.session && S.me) {
      var other = p.phone && digits(S.me.phone) !== p.phone;
      body = '<div class="card stack">' + (other ? '<div class="msg info">Tu es connecté(e) avec le numéro <b>' + esc(showPhone(S.me.phone)) + "</b>, mais cette invitation est pour le <b>" + esc(showPhone(p.phone)) + "</b>. Si ce n'est pas toi, déconnecte-toi.</div>" : "") +
        '<div id="i-msg"></div><button class="btn btn-gold btn-block" data-act="inv-accept">Rejoindre le groupe</button>' + (other ? '<button class="btn btn-light" data-act="logout">Se déconnecter</button>' : "") + "</div>";
    } else if (p.has_account) {
      body = '<form id="f-inv-login" class="card stack" novalidate><h3>Tu as déjà un compte Mbootaay</h3><p class="small muted" style="margin:0">Entre ton mot de passe pour rejoindre le groupe.</p>' +
        '<div class="field"><label>Numéro</label><input type="tel" value="' + esc(showPhone(p.phone)) + '" readonly></div>' + pwField("i-pass", "Mot de passe", "current-password") +
        '<div id="i-msg"></div><button class="btn btn-gold btn-block" type="submit">Rejoindre le groupe</button><p class="small muted center" style="margin:0">Mot de passe oublié ? Demande un lien à ton président.</p></form>';
    } else {
      body = '<form id="f-inv-signup" class="card stack" novalidate><h3>Crée ton accès</h3><p class="small muted" style="margin:0">Vérifie tes informations et choisis un mot de passe.</p>' +
        '<div class="grid2" style="gap:12px"><div class="field"><label for="i-first">Prénom</label><input id="i-first" type="text" maxlength="60" value="' + esc(p.first_name) + '"></div>' +
        '<div class="field"><label for="i-last">Nom</label><input id="i-last" type="text" maxlength="60" value="' + esc(p.last_name) + '"></div></div>' +
        '<div class="field"><label for="i-phone">Numéro de téléphone</label><input id="i-phone" type="tel" inputmode="numeric" value="' + esc(p.phone ? showPhone(p.phone) : "") + '"' + (p.phone ? " readonly" : ' placeholder="77 123 45 67"') + "><small>Il te servira pour te connecter.</small></div>" +
        pwField("i-pass", "Mot de passe (8 caractères minimum)", "new-password") + pwField("i-pass2", "Confirme le mot de passe", "new-password") +
        '<div id="i-msg"></div><button class="btn btn-gold btn-block" type="submit">Rejoindre le groupe</button></form>';
    }
    app.innerHTML = '<div class="stack" style="max-width:520px;margin:0 auto">' + top + body + '<p class="center small muted">Ce lien est personnel : ne le transfère à personne.</p></div>';
  }
  async function acceptInvite() {
    var gid = await rpc("accept_invitation", { p_token: S.inv.token });
    S.inv = null; S.g = null;
    toast("Bienvenue dans le groupe !", "ok");
    location.hash = "#/g/" + gid;
  }

  /* ---------------- Nouveau mot de passe par lien ---------------- */
  async function viewReset(token) {
    loading();
    var p;
    try { p = await rpc("reset_preview", { p_token: token }); } catch (e) { app.innerHTML = '<div class="msg err">' + esc(errText(e)) + "</div>"; return; }
    if (!p || !p.valid) { app.innerHTML = '<div class="card center stack" style="max-width:480px;margin:10px auto"><h2>Lien indisponible</h2><p class="muted">Ce lien a expiré (24 h) ou a déjà servi. Demande un nouveau lien.</p><a class="btn btn-light" href="#/connexion">Se connecter</a></div>'; return; }
    S.reset = { token: token, phone: p.phone };
    app.innerHTML = '<form id="f-reset" class="card stack" style="max-width:480px;margin:10px auto" novalidate><h1>Nouveau mot de passe</h1><p class="muted" style="margin:0">Bonjour ' + esc(p.first_name) + ", choisis ton nouveau mot de passe pour le numéro <b>" + esc(showPhone(p.phone)) + "</b>.</p>" +
      pwField("r-pass", "Nouveau mot de passe", "new-password") + pwField("r-pass2", "Confirme", "new-password") +
      '<div id="r-msg"></div><button class="btn btn-gold btn-block" type="submit">Enregistrer</button></form>';
  }

  /* ---------------- Aide ---------------- */
  function viewHelp() {
    function block(title, color, items) { return '<div class="card stack"><h3 style="color:' + color + '">' + title + '</h3><ol style="margin:0;padding-left:20px" class="stack">' + items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol></div>"; }
    app.innerHTML = '<div class="stack" style="max-width:760px;margin:0 auto"><div class="pagehead"><a class="back" href="#/" aria-label="Retour">' + ICON.back + "</a><h1>Comment ça marche</h1></div>" +
      '<div class="grid2">' +
      block("Je suis membre", "#0E7A5F", ["Ouvre le <b>lien personnel</b> reçu sur WhatsApp et choisis ton mot de passe.", "Paie ta cotisation sur le numéro Wave ou Orange Money du groupe.", "Dans <b>Payer</b>, envoie la capture : le trésorier la vérifie.", "Dans <b>Caisse</b>, vois ce que tu as versé et le solde du groupe."]) +
      block("Je suis trésorier(e)", "#2F6FDB", ["Dans <b>Bureau</b>, vérifie chaque capture puis <b>Valider</b> : la caisse se met à jour pour tous.", "Pour un membre sans smartphone, ajoute sa cotisation dans <b>Caisse → Ajouter une opération</b>.", "Une erreur ? Bouton ↺ : l'annulation reste visible, rien n'est effacé."]) +
      block("Je suis président(e) ou secrétaire", "#7A4FD1", ["Ajoute les membres (nom + numéro) dans <b>Membres</b>.", "Bouton <b>Inviter</b> : WhatsApp s'ouvre avec le lien personnel du membre.", "Publie les annonces du groupe.", "Un membre a oublié son mot de passe ? <b>Lien mot de passe</b> sur sa fiche."]) +
      block("J'ouvre l'espace d'un groupe", "#B9801A", ["<b>Ouvrir un espace</b> : type, cotisation, numéros de paiement.", "Nomme le bureau et ajoute la liste des membres.", "<b>Lance le groupe</b> : l'essai gratuit commence, envoie les invitations.", "Avant la fin de l'essai, choisis une formule dans <b>Réglages</b>."]) +
      "</div>" + (S.settings.support_whatsapp ? '<a class="btn btn-light" target="_blank" rel="noopener" href="https://wa.me/' + esc(String(S.settings.support_whatsapp).replace(/\D/g, "")) + '">Une question ? Assistance sur WhatsApp</a>' : "") + "</div>";
  }

  async function viewJoin(code) {
    app.innerHTML = '<div class="stack" style="max-width:520px;margin:0 auto">' +
      '<div class="pagehead"><a class="back" href="#/" aria-label="Retour">' + ICON.back + "</a><h1>Rejoindre un groupe</h1></div>" +
      '<form id="f-join" class="card stack" novalidate><div class="field"><label for="j-code">Code d\'invitation</label>' +
      '<input id="j-code" type="text" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="Ex. K7PM4TQX" value="' + esc(code) + '" style="text-transform:uppercase;letter-spacing:.2em;font-weight:800;font-size:1.3rem;text-align:center"></div>' +
      '<div id="j-msg"></div><button class="btn btn-gold btn-block" type="submit">Envoyer ma demande</button>' +
      '<p class="small muted center" style="margin:0">Le bureau du groupe doit accepter ta demande.</p></form></div>';
    try { localStorage.removeItem("mb_join"); } catch (e) { /* rien */ }
    if (code && code.length === 8) {
      await doJoin(code, document.querySelector("#f-join button[type=submit]"));
    }
  }
  async function doJoin(code, btn) {
    var box = document.getElementById("j-msg");
    lockBtn(btn, true);
    try {
      var gid = await rpc("join_group", { p_code: code });
      try { localStorage.removeItem("mb_join"); } catch (e) { /* rien */ }
      var mine = await rpc("my_groups");
      var g = mine.find(function (x) { return x.group_id === gid; });
      if (g && g.status === "actif") { location.hash = "#/g/" + gid; return; }
      toast("Demande envoyée au bureau du groupe", "ok");
      location.hash = "#/";
    } catch (e) {
      if (box) box.innerHTML = '<div class="msg err">' + esc(errText(e)) + "</div>";
      if (/déjà membre/.test(errText(e))) setTimeout(function () { location.hash = "#/"; }, 1200);
    } finally { lockBtn(btn, false); }
  }

  /* ---------------- Groupe ---------------- */
  async function loadGroup(gid) {
    var g = await q(sb.from("groups").select("*").eq("id", gid).maybeSingle());
    if (!g) return null;
    var sit = await rpc("my_situation", { p_group: gid });
    g.sit = sit; g.role = sit.role; g.state = sit.state;
    g.todo = 0;
    if (["proprietaire", "tresorier"].indexOf(g.role) >= 0) {
      var r1 = await sb.from("payment_proofs").select("id", { count: "exact", head: true }).eq("group_id", gid).eq("status", "en_attente");
      g.todo += r1.count || 0;
    }
    if (["proprietaire", "president", "secretaire"].indexOf(g.role) >= 0) {
      var r2 = await sb.from("memberships").select("user_id", { count: "exact", head: true }).eq("group_id", gid).eq("status", "en_attente");
      g.pendingMembers = r2.count || 0;
      g.todo += g.pendingMembers;
    }
    return g;
  }
  function can(g, roles) { return g && roles.indexOf(g.role) >= 0; }
  function writable(g) { return g.state === "essai" || g.state === "actif" || g.state === "preparation"; }
  function stateBanner(g) {
    if (g.state === "preparation") return '<div class="msg info">Groupe <b>en préparation</b> : les membres ne le voient pas encore. <a href="#/g/' + g.id + '/lancement">Terminer et lancer</a></div>';
    if (g.state === "essai") {
      var d = daysLeft(g.trial_ends_at);
      return '<div class="msg info">Essai gratuit : encore <b>' + Math.max(d, 0) + " jour" + (d > 1 ? "s" : "") + "</b>." + (can(g, ["proprietaire", "president", "tresorier"]) ? ' <a href="#/g/' + g.id + '/reglages">Choisir une formule</a>' : "") + "</div>";
    }
    if (g.state === "lecture_seule") return '<div class="msg err">L\'abonnement du groupe a expiré : consultation seulement, aucun ajout possible.' + (can(g, ["proprietaire", "president", "tresorier"]) ? ' <a href="#/g/' + g.id + '/reglages">Renouveler</a>' : " Le bureau doit renouveler l'abonnement.") + "</div>";
    if (g.state === "suspendu") return '<div class="msg err">Ce groupe est suspendu par Mbootaay. Contacte l\'assistance.</div>';
    if (g.paid_until && daysLeft(g.paid_until) <= 7 && can(g, ["proprietaire", "president", "tresorier"])) return '<div class="msg info">L\'abonnement se termine le ' + dt(g.paid_until) + '. <a href="#/g/' + g.id + '/reglages">Renouveler</a></div>';
    return "";
  }
  function head(g, title) {
    var t = typeOf(g.type);
    return '<div class="pagehead"><a class="back" href="' + (title ? "#/g/" + g.id : "#/") + '" aria-label="Retour">' + ICON.back + '</a><div style="min-width:0"><span class="small" style="color:' + t.color + ';font-weight:800">' + esc(t.label) + " · " + esc(g.name) + "</span><h1>" + esc(title || g.name) + "</h1></div></div>";
  }

  async function viewGroup(gid, sub) {
    if (!/^[0-9a-f-]{36}$/i.test(gid)) { location.hash = "#/"; return; }
    setTopnav("home");
    loading();
    var g;
    try {
      g = (S.g && S.g.id === gid && S.g._t > Date.now() - 15000) ? S.g : await loadGroup(gid);
    } catch (e) { setBottom(null); app.innerHTML = '<div class="msg err">' + esc(errText(e)) + '</div><p><a href="#/">Retour à mes groupes</a></p>'; return; }
    if (!g) { setBottom(null); app.innerHTML = '<div class="card center stack"><h2>Groupe introuvable</h2><p class="muted">Tu n\'es pas (ou plus) membre de ce groupe.</p><a class="btn btn-light" href="#/">Mes groupes</a></div>'; return; }
    g._t = g._t || Date.now();
    S.g = g;
    if (g.state === "preparation" && (sub === "accueil" || sub === "payer" || sub === "annonces" || sub === "bureau")) sub = "lancement";
    if (g.state !== "preparation" && sub === "lancement") sub = "accueil";
    setBottom(gid, sub, g);
    var views = { lancement: gLaunch, accueil: gHome, payer: gPay, caisse: gLedger, membres: gMembers, annonces: gNews, bureau: gBureau, reglages: gSettings };
    try { await (views[sub] || gHome)(g); }
    catch (e) { app.innerHTML = head(g, "Erreur") + '<div class="msg err">' + esc(errText(e)) + "</div>"; }
  }
  function refreshGroup() { if (S.g) S.g._t = 0; S.g = null; route(); }

  async function gHome(g) {
    var s = g.sit;
    var news = await q(sb.from("announcements").select("*").eq("group_id", g.id).order("created_at", { ascending: false }).limit(3));
    var link = location.origin + location.pathname + "#/rejoindre/" + g.invite_code;
    var payInfo = [];
    if (g.wave_number) payInfo.push('<div class="item"><div class="grow"><span class="small muted">Wave</span><b>' + esc(showPhone(g.wave_number)) + '</b></div><button class="btn btn-light btn-sm" data-act="copy" data-text="' + esc(digits(g.wave_number)) + '">Copier</button></div>');
    if (g.om_number) payInfo.push('<div class="item"><div class="grow"><span class="small muted">Orange Money</span><b>' + esc(showPhone(g.om_number)) + '</b></div><button class="btn btn-light btn-sm" data-act="copy" data-text="' + esc(digits(g.om_number)) + '">Copier</button></div>');
    var bureau = can(g, ["proprietaire", "president", "tresorier", "secretaire"]);
    app.innerHTML = '<div class="stack">' + head(g) + stateBanner(g) +
      '<section class="hero-g"><p class="lab">Solde de la caisse</p><p class="big">' + fcfa(s.balance) + "</p>" +
      '<div class="tiles"><div class="tile"><small>J\'ai cotisé</small><b>' + fcfa(s.my_total) + '</b></div><div class="tile"><small>J\'ai reçu</small><b>' + fcfa(s.my_received) + "</b></div>" +
      (Number(s.pending_proofs) > 0 ? '<div class="tile"><small>En vérification</small><b>' + esc(s.pending_proofs) + " preuve" + (s.pending_proofs > 1 ? "s" : "") + "</b></div>" : "") + "</div></section>" +
      '<div class="grid2">' +
      '<div class="card stack"><h3>Payer ma cotisation</h3>' +
      (g.contribution_amount ? '<p style="margin:0">Montant : <b>' + fcfa(g.contribution_amount) + "</b> " + esc(PERIODS[g.contribution_period] || "") + "</p>" : '<p class="muted" style="margin:0">Montant libre.</p>') +
      (payInfo.length ? '<div class="list">' + payInfo.join("") + "</div>" : '<p class="small muted" style="margin:0">Aucun numéro de paiement enregistré : renseigne-toi auprès du trésorier.</p>') +
      (writable(g) ? '<a class="btn btn-gold btn-block" href="#/g/' + g.id + '/payer">J\'ai payé : envoyer la capture</a>' : "") + "</div>" +
      '<div class="card stack"><div class="row" style="justify-content:space-between"><h3>Annonces</h3><a class="small" href="#/g/' + g.id + '/annonces">Tout voir</a></div>' +
      (news.length ? '<div class="list">' + news.map(newsItem).join("") + "</div>" : '<p class="muted" style="margin:0">Aucune annonce pour le moment.</p>') + "</div>" +
      (can(g, ["proprietaire", "president", "secretaire"]) ? '<div class="card stack"><h3>Inviter des membres</h3><p class="small muted" style="margin:0">Ajoute chaque membre avec son numéro, puis envoie-lui son lien personnel sur WhatsApp.</p><a class="btn btn-green" href="#/g/' + g.id + '/membres">' + ICON.people + " Gérer les membres</a>" +
        (g.join_code_enabled ? '<p class="small muted" style="margin:0">Code du groupe : <b style="letter-spacing:.12em">' + esc(g.invite_code) + '</b> · <button class="link" data-act="copy" data-text="' + esc(link) + '">copier le lien</button></p>' : "") + "</div>" : "") +
      '<div class="card stack"><h3>Raccourcis</h3><div class="list">' +
      '<a class="item" href="#/g/' + g.id + '/caisse" style="text-decoration:none;color:inherit"><div class="grow"><b>Historique de la caisse</b><span class="small muted">Toutes les entrées et sorties</span></div></a>' +
      '<a class="item" href="#/g/' + g.id + '/membres" style="text-decoration:none;color:inherit"><div class="grow"><b>Membres et bureau</b><span class="small muted">Qui fait quoi</span></div></a>' +
      (bureau ? '<a class="item" href="#/g/' + g.id + '/bureau" style="text-decoration:none;color:inherit"><div class="grow"><b>Espace bureau</b><span class="small muted">' + (g.todo ? esc(g.todo) + " élément(s) à traiter" : "Rien à traiter") + "</span></div></a>" : "") +
      (can(g, ["proprietaire", "president", "tresorier"]) ? '<a class="item" href="#/g/' + g.id + '/reglages" style="text-decoration:none;color:inherit"><div class="grow"><b>Réglages et abonnement</b><span class="small muted">' + esc((STATES[g.state] || ["", ""])[1]) + "</span></div></a>" : "") +
      "</div></div></div></div>";
  }
  function newsItem(a) {
    return '<div class="item" style="align-items:flex-start"><div class="grow"><b>' + (a.is_system ? "⚠️ " : "") + esc(a.title) + '</b><span class="small muted">' + dtt(a.created_at) + '</span><p style="margin:6px 0 0;white-space:pre-wrap">' + esc(a.body) + "</p></div></div>";
  }

  async function gPay(g) {
    var mine = await q(sb.from("payment_proofs").select("*").eq("group_id", g.id).eq("user_id", S.me.id).order("created_at", { ascending: false }).limit(20));
    var hist = mine.map(function (p) {
      var b = p.status === "valide" ? '<span class="badge b-ok">Validée</span>' : p.status === "refuse" ? '<span class="badge b-bad">Refusée</span>' : '<span class="badge b-warn">En attente</span>';
      return '<div class="item"><div class="grow"><b>' + fcfa(p.amount) + " · " + esc(METHODS[p.method]) + '</b><span class="small muted">' + esc(periodLabel(p.period)) + " · " + dtt(p.created_at) + (p.note ? " · " + esc(p.note) : "") + "</span></div>" + b + "</div>";
    }).join("");
    var methods = Object.keys(METHODS).map(function (k, i) { return '<button type="button" data-act="pick" data-name="method" data-val="' + k + '" class="' + (i === 0 ? "on" : "") + '">' + esc(METHODS[k]) + "</button>"; }).join("");
    app.innerHTML = '<div class="stack" style="max-width:640px;margin:0 auto">' + head(g, "Payer ma cotisation") + stateBanner(g) +
      (writable(g) ?
        '<form id="f-pay" class="card stack" novalidate><input type="hidden" id="p-method" value="wave">' +
        (g.wave_number || g.om_number ? '<div class="msg ok">Paie d\'abord sur ' + (g.wave_number ? "Wave <b>" + esc(showPhone(g.wave_number)) + "</b>" : "") + (g.wave_number && g.om_number ? " ou " : "") + (g.om_number ? "Orange Money <b>" + esc(showPhone(g.om_number)) + "</b>" : "") + ", puis envoie ta capture ici.</div>" : "") +
        '<div class="grid2" style="gap:12px"><div class="field"><label for="p-amount">Montant payé (F CFA)</label><input id="p-amount" type="number" inputmode="numeric" min="1" value="' + esc(g.contribution_amount || "") + '" required></div>' +
        '<div class="field"><label for="p-period">Pour le mois de</label><input id="p-period" type="month" value="' + thisMonth() + '"></div></div>' +
        '<div class="field"><label>Moyen de paiement</label><div class="choice" data-group="method">' + methods + "</div></div>" +
        '<div class="field"><label>Capture du paiement</label><label class="drop" id="p-drop" for="p-file">' + ICON.camera + '<b>Ajouter la capture</b><span class="small muted">Photo ou PDF, 3 Mo maximum</span></label><input id="p-file" class="sr" type="file" accept="image/*,application/pdf"><small>Obligatoire pour Wave et Orange Money.</small></div>' +
        '<div id="p-msg"></div><button class="btn btn-gold btn-block" type="submit">Envoyer au trésorier</button></form>' : "") +
      '<div class="card stack"><h3>Mes envois</h3>' + (hist ? '<div class="list">' + hist + "</div>" : '<p class="muted" style="margin:0">Aucun envoi pour le moment.</p>') + "</div></div>";
  }

  var pickedFile = null;
  async function prepareFile(file) {
    if (!file) return null;
    if (file.type === "application/pdf") {
      if (file.size > 3 * 1024 * 1024) throw new Error("Le PDF dépasse 3 Mo.");
      return { blob: file, ext: "pdf", type: "application/pdf" };
    }
    if (!/^image\//.test(file.type)) throw new Error("Format non accepté : envoie une photo ou un PDF.");
    var url = URL.createObjectURL(file);
    try {
      var img = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error("Image illisible.")); }; i.src = url; });
      var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
      var blob = await new Promise(function (res) { cv.toBlob(res, "image/jpeg", 0.82); });
      if (!blob) throw new Error("Image illisible.");
      if (blob.size > 3 * 1024 * 1024) throw new Error("Image trop lourde.");
      return { blob: blob, ext: "jpg", type: "image/jpeg" };
    } finally { URL.revokeObjectURL(url); }
  }
  async function uploadProof(gid, prepared) {
    var rnd = Math.random().toString(36).slice(2, 8);
    var path = gid + "/" + S.me.id + "/" + Date.now() + "-" + rnd + "." + prepared.ext;
    var r = await sb.storage.from("mb-preuves").upload(path, prepared.blob, { contentType: prepared.type, upsert: false });
    if (r.error) throw r.error;
    return path;
  }
  async function viewFile(path) {
    try {
      var r = await sb.storage.from("mb-preuves").createSignedUrl(path, 300);
      if (r.error) throw r.error;
      if (/\.pdf$/i.test(path)) { window.open(r.data.signedUrl, "_blank", "noopener"); return; }
      var m = document.createElement("div");
      m.className = "modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", "Capture");
      m.innerHTML = '<img alt="Capture du paiement"><button class="btn btn-light btn-sm" data-act="close-modal">Fermer</button>';
      m.querySelector("img").src = r.data.signedUrl;
      document.body.appendChild(m);
    } catch (e) { toast(errText(e), "err"); }
  }

  async function gLedger(g) {
    var rows = await q(sb.from("ledger_entries").select("*").eq("group_id", g.id).order("created_at", { ascending: false }).limit(300));
    var members = await rpc("group_members", { p_group: g.id });
    var names = {}; members.forEach(function (m) { names[m.member_id] = m.first_name + " " + m.last_name + (m.linked ? "" : " ·  sans appli"); });
    var reversed = {}; rows.forEach(function (r) { if (r.reverses) reversed[r.reverses] = true; });
    var tres = can(g, ["proprietaire", "tresorier"]) && writable(g);
    var totIn = 0, totOut = 0;
    rows.forEach(function (r) { if (r.sign > 0) totIn += Number(r.amount); else totOut += Number(r.amount); });
    var mineOnly = sessionStorage.getItem("mb_ledger_mine") === "1";
    var shown = mineOnly ? rows.filter(function (r) { return r.member_id && r.member_id === g.sit.member_id; }) : rows;
    var list = shown.map(function (r) {
      var cancelled = reversed[r.id];
      return '<div class="item"><div class="grow' + (cancelled ? " struck" : "") + '"><b>' + esc(r.label) + '</b><span class="small muted">' + esc(KINDS[r.kind] || r.kind) + (r.member_id ? " · " + esc(names[r.member_id] || "Ancien membre").replace(" ·  sans appli", "") : "") + (r.period ? " · " + esc(periodLabel(r.period)) : "") + " · " + dtt(r.created_at) + (cancelled ? " · annulée" : "") + "</span></div>" +
        '<span class="' + (r.sign > 0 ? "amt-p" : "amt-m") + '">' + (r.sign > 0 ? "+" : "−") + fcfa(r.amount) + "</span>" +
        (r.proof_path ? '<button class="btn btn-light btn-sm" data-act="file" data-path="' + esc(r.proof_path) + '" aria-label="Voir le justificatif">📎</button>' : "") +
        (tres && !cancelled && r.kind !== "annulation" ? '<button class="btn btn-light btn-sm" data-act="reverse" data-id="' + esc(r.id) + '" aria-label="Annuler cette opération">↺</button>' : "") +
        "</div>";
    }).join("");
    var memberOpts = '<option value="">— Aucun —</option>' + members.filter(function (m) { return m.status === "actif"; }).map(function (m) { return '<option value="' + esc(m.member_id) + '">' + esc(m.first_name + " " + m.last_name) + (m.linked ? "" : " (sans appli)") + "</option>"; }).join("");
    app.innerHTML = '<div class="stack">' + head(g, "Caisse") + (g.state === "preparation" ? stateBanner(g) : "") +
      '<section class="hero-g"><p class="lab">Solde actuel</p><p class="big">' + fcfa(totIn - totOut) + '</p><div class="tiles"><div class="tile"><small>Entrées</small><b>' + fcfa(totIn) + '</b></div><div class="tile"><small>Sorties</small><b>' + fcfa(totOut) + "</b></div></div></section>" +
      (tres ? '<details class="card"><summary style="cursor:pointer;font-weight:800">' + ICON.plus + ' Ajouter une opération</summary><form id="f-ledger" class="stack" style="margin-top:14px" novalidate>' +
        '<div class="grid2" style="gap:12px"><div class="field"><label for="le-kind">Type</label><select id="le-kind">' + ["cotisation", "entree", "sortie", "tour", "aide", "solde_initial"].map(function (k) { return '<option value="' + k + '">' + esc(KINDS[k]) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="le-amount">Montant (F CFA)</label><input id="le-amount" type="number" inputmode="numeric" min="1" required></div>' +
        '<div class="field"><label for="le-member">Membre concerné</label><select id="le-member">' + memberOpts + "</select></div>" +
        '<div class="field"><label for="le-period">Période</label><input id="le-period" type="month" value="' + thisMonth() + '"></div></div>' +
        '<div class="field"><label for="le-label">Libellé</label><input id="le-label" type="text" maxlength="200" placeholder="Ex. Achat de chaises pour la cérémonie" required></div>' +
        '<div class="field"><label>Justificatif (facultatif)</label><label class="drop" id="le-drop" for="le-file">' + ICON.camera + '<span class="small muted">Reçu, facture…</span></label><input id="le-file" class="sr" type="file" accept="image/*,application/pdf"></div>' +
        '<p class="small muted" style="margin:0">Une opération enregistrée ne peut pas être effacée : en cas d\'erreur, on l\'annule et l\'annulation reste visible.</p>' +
        '<div id="le-msg"></div><button class="btn btn-green btn-block" type="submit">Enregistrer</button></form></details>' : "") +
      '<div class="card stack"><div class="row" style="justify-content:space-between"><h3>Historique</h3><div class="row">' +
      '<button class="btn btn-sm ' + (mineOnly ? "btn-light" : "btn-green") + '" data-act="ledger-filter" data-mine="0">Tout</button><button class="btn btn-sm ' + (mineOnly ? "btn-green" : "btn-light") + '" data-act="ledger-filter" data-mine="1">Moi</button></div></div>' +
      (list ? '<div class="list">' + list + "</div>" : '<p class="muted" style="margin:0">Aucune opération.</p>') + "</div></div>";
  }

  function addMembersForm(g) {
    return '<details class="card"' + (g.state === "preparation" ? " open" : "") + '><summary style="cursor:pointer;font-weight:800">' + ICON.plus + ' Ajouter des membres</summary><div class="stack" style="margin-top:14px">' +
      '<form id="f-add1" class="stack" novalidate><div class="grid2" style="gap:12px"><div class="field"><label for="a-first">Prénom</label><input id="a-first" type="text" maxlength="60"></div>' +
      '<div class="field"><label for="a-last">Nom</label><input id="a-last" type="text" maxlength="60"></div></div>' +
      '<div class="field"><label for="a-phone">Numéro (facultatif)</label><input id="a-phone" type="tel" inputmode="numeric" placeholder="77 123 45 67"><small>Sans numéro, le membre est suivi dans la caisse mais ne peut pas recevoir d\'invitation.</small></div>' +
      '<div id="a-msg"></div><button class="btn btn-green" type="submit">Ajouter ce membre</button></form>' +
      '<form id="f-addlist" class="stack" novalidate style="border-top:1px solid var(--line);padding-top:14px"><div class="field"><label for="a-list">Ou colle une liste (un membre par ligne)</label>' +
      '<textarea id="a-list" placeholder="Awa Diop 77 123 45 67&#10;Fatou Ndiaye 78 765 43 21&#10;Mame Seck"></textarea><small>Prénom, nom, puis le numéro s\'il y en a un.</small></div>' +
      '<div id="al-msg"></div><button class="btn btn-light" type="submit">Vérifier la liste</button></form></div></details>';
  }
  var INV = { relie: ["b-ok", "Compte relié"], envoyee: ["b-warn", "Invitation envoyée"], expiree: ["b-bad", "Lien expiré"], aucune: ["b-grey", "Pas encore invité"] };
  function memberRow(g, m, opts) {
    var me = m.user_id === S.me.id;
    var isOwner = g.role === "proprietaire";
    var tools = "";
    var chip = "";
    if (opts.bureau && m.status === "actif") {
      var st = m.linked ? "relie" : (m.phone ? m.invite_status : null);
      chip = st ? '<span class="badge ' + INV[st][0] + '">' + INV[st][1] + "</span>" : '<span class="badge b-grey">Sans téléphone</span>';
    }
    if (m.status === "en_attente") {
      if (opts.reviewer) tools = '<button class="btn btn-green btn-sm" data-act="member" data-member="' + esc(m.member_id) + '" data-d="accepter">Accepter</button><button class="btn btn-bad btn-sm" data-act="member" data-member="' + esc(m.member_id) + '" data-d="refuser">Refuser</button>';
    } else {
      if (opts.inviter && !m.linked && m.phone && g.state !== "preparation") tools += '<button class="btn btn-green btn-sm" data-act="invite" data-member="' + esc(m.member_id) + '">' + (m.invite_status === "aucune" ? "Inviter" : "Renvoyer") + "</button>";
      if (opts.inviter && !m.linked) tools += '<button class="btn btn-light btn-sm" data-act="edit-member" data-member="' + esc(m.member_id) + '" data-first="' + esc(m.first_name) + '" data-last="' + esc(m.last_name) + '" data-phone="' + esc(m.phone ? digits(m.phone) : "") + '">Modifier</button>';
      if (opts.resetter && m.linked && !me && m.role === "membre") tools += '<button class="btn btn-light btn-sm" data-act="reset-link" data-member="' + esc(m.member_id) + '" data-name="' + esc(m.first_name) + '" data-phone="' + esc(m.phone ? digits(m.phone) : "") + '">Lien mot de passe</button>';
      if (isOwner && !me && writable(g)) tools += '<select data-act="role" data-member="' + esc(m.member_id) + '" aria-label="Rôle" style="width:auto;min-height:42px">' + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (k === m.role ? " selected" : "") + ">" + esc(ROLES[k]) + "</option>"; }).join("") + "</select>";
      if (opts.reviewer && !me && m.role !== "proprietaire" && (m.role === "membre" || isOwner)) tools += '<button class="btn btn-bad btn-sm" data-act="member" data-member="' + esc(m.member_id) + '" data-d="retirer">Retirer</button>';
    }
    var phone = m.phone ? (opts.bureau ? esc(showPhone(m.phone)) : '<a href="tel:' + esc(m.phone) + '">' + esc(showPhone(m.phone)) + "</a>") : (opts.bureau ? "pas de numéro" : "téléphone masqué");
    var sub = m.status === "en_attente" ? "demande du " + dt(m.requested_at) + " (code du groupe)" : esc(ROLES[m.role]) + " · " + phone;
    return '<div class="item wrapitem"><div class="avatar" style="' + (m.linked ? "" : "background:#B8C7C0") + '">' + esc(initials(m.first_name, m.last_name)) + '</div><div class="grow"><b>' + esc(m.first_name + " " + m.last_name) + (me ? " (moi)" : "") + '</b><span class="small muted">' + sub + "</span>" + (chip ? '<div style="margin-top:4px">' + chip + (m.invite_status === "envoyee" && !m.linked ? ' <span class="small muted">jusqu\'au ' + dt(m.invite_expires) + "</span>" : "") + "</div>" : "") + "</div>" + tools + "</div>";
  }
  async function gMembers(g) {
    var rows = await rpc("group_members", { p_group: g.id });
    var act = rows.filter(function (m) { return m.status === "actif"; });
    var wait = rows.filter(function (m) { return m.status === "en_attente"; });
    var bureau = can(g, ["proprietaire", "president", "tresorier", "secretaire"]);
    var opts = { bureau: bureau, reviewer: can(g, ["proprietaire", "president", "secretaire"]) && writable(g), inviter: can(g, ["proprietaire", "president", "secretaire"]) && writable(g), resetter: can(g, ["proprietaire", "president"]) };
    var notInvited = act.filter(function (m) { return !m.linked && m.phone && m.invite_status !== "envoyee"; }).length;
    var linked = act.filter(function (m) { return m.linked; }).length;
    app.innerHTML = '<div class="stack">' + head(g, "Membres") + (g.state === "preparation" ? stateBanner(g) : "") +
      (bureau ? '<div class="kpis"><div class="kpi k1"><small>Membres</small><b>' + act.length + '</b></div><div class="kpi k2"><small>Comptes reliés</small><b>' + linked + '</b></div><div class="kpi k3"><small>À inviter</small><b>' + notInvited + "</b></div></div>" : "") +
      (opts.inviter && notInvited && g.state !== "preparation" ? '<button class="btn btn-gold" data-act="invite-all">Envoyer les invitations (' + notInvited + ")</button>" : "") +
      (opts.inviter ? addMembersForm(g) : "") +
      (wait.length ? '<div class="card stack"><h3>Demandes par code (' + wait.length + ')</h3><div class="list">' + wait.map(function (m) { return memberRow(g, m, opts); }).join("") + "</div></div>" : "") +
      '<div class="card stack"><h3>' + act.length + " membre" + (act.length > 1 ? "s" : "") + '</h3><div class="list">' + act.map(function (m) { return memberRow(g, m, opts); }).join("") + "</div></div>" +
      (g.role !== "proprietaire" ? '<button class="btn btn-bad" data-act="leave">Quitter ce groupe</button>' : '<p class="small muted">Pour quitter le groupe, donne d\'abord le rôle « Propriétaire » à un membre qui a relié son compte.</p>') +
      "</div>";
  }

  /* Préparation : bureau, membres, récapitulatif, lancement */
  async function gLaunch(g) {
    var rows = await rpc("group_members", { p_group: g.id });
    var act = rows.filter(function (m) { return m.status === "actif"; });
    var hasTres = act.some(function (m) { return m.role === "tresorier" || m.role === "proprietaire"; });
    var isOwner = g.role === "proprietaire";
    var trial = Number(S.settings.trial_days || 15);
    var others = act.filter(function (m) { return m.user_id !== S.me.id; });
    var bureauRows = others.length ? others.map(function (m) {
      return '<div class="item wrapitem"><div class="avatar">' + esc(initials(m.first_name, m.last_name)) + '</div><div class="grow"><b>' + esc(m.first_name + " " + m.last_name) + '</b><span class="small muted">' + esc(m.phone ? showPhone(m.phone) : "pas de numéro") + "</span></div>" +
        (isOwner ? '<select data-act="role" data-member="' + esc(m.member_id) + '" aria-label="Rôle" style="width:auto;min-height:42px">' + ["membre", "president", "tresorier", "secretaire"].map(function (k) { return '<option value="' + k + '"' + (k === m.role ? " selected" : "") + ">" + esc(ROLES[k]) + "</option>"; }).join("") + "</select>" : '<span class="badge b-grey">' + esc(ROLES[m.role]) + "</span>") + "</div>";
    }).join("") : '<p class="muted" style="margin:0">Ajoute d\'abord les membres ci-dessous, puis donne-leur un rôle ici.</p>';
    var ok1 = true, ok2 = others.length > 0;
    app.innerHTML = '<div class="stack" style="max-width:760px;margin:0 auto">' + head(g, "Préparer le groupe") + steps(others.length ? 5 : 4) +
      '<div class="card stack"><div class="row" style="justify-content:space-between"><h3>1 à 3 · Le groupe</h3><a class="small" href="#/g/' + g.id + '/reglages">Modifier</a></div>' +
      '<p style="margin:0"><b>' + esc(typeOf(g.type).label) + "</b> · cotisation " + (g.contribution_amount ? fcfa(g.contribution_amount) + " " + esc(PERIODS[g.contribution_period] || "") : "libre") + "<br>" +
      "Wave : <b>" + esc(g.wave_number ? showPhone(g.wave_number) : "—") + "</b> · Orange Money : <b>" + esc(g.om_number ? showPhone(g.om_number) : "—") + "</b></p></div>" +
      '<div class="card stack"><h3>4 · Le bureau</h3><p class="small muted" style="margin:0">Tu es <b>propriétaire</b>. Choisis qui est président(e), trésorier(e) et secrétaire. Leurs droits s\'activeront dès qu\'ils auront relié leur compte.</p><div class="list">' + bureauRows + "</div></div>" +
      '<div class="stack"><h3>5 · Les membres (' + act.length + ")</h3>" + (can(g, ["proprietaire", "president", "secretaire"]) ? addMembersForm(g) : "") +
      (others.length ? '<div class="card"><div class="list">' + others.map(function (m) { return '<div class="item"><div class="grow"><b>' + esc(m.first_name + " " + m.last_name) + '</b><span class="small muted">' + esc(m.phone ? showPhone(m.phone) : "sans téléphone : suivi dans la caisse uniquement") + "</span></div></div>"; }).join("") + "</div></div>" : "") + "</div>" +
      '<div class="card stack" style="border:2px solid var(--gold)"><h3>Récapitulatif</h3><div class="list">' +
      '<div class="item"><div class="grow"><b>Informations du groupe</b></div><span class="badge b-ok">Prêt</span></div>' +
      '<div class="item"><div class="grow"><b>Trésorier désigné</b><span class="small muted">' + (hasTres ? "Les paiements pourront être validés." : "Sinon, c'est toi qui valides les paiements.") + "</span></div>" + (act.some(function (m) { return m.role === "tresorier"; }) ? '<span class="badge b-ok">Oui</span>' : '<span class="badge b-warn">Pas encore</span>') + "</div>" +
      '<div class="item"><div class="grow"><b>Membres inscrits</b></div>' + (ok2 ? '<span class="badge b-ok">' + act.length + "</span>" : '<span class="badge b-bad">Au moins 1 autre</span>') + "</div></div>" +
      (isOwner ? '<p class="small muted" style="margin:0">En lançant le groupe, les <b>' + trial + " jours d'essai gratuit</b> commencent et tu pourras envoyer les invitations personnelles.</p>" +
        '<div id="l-msg"></div><button class="btn btn-gold btn-block" data-act="launch"' + (ok1 && ok2 ? "" : " disabled") + ">🚀 Lancer le groupe</button>" : '<p class="small muted">Seul le propriétaire peut lancer le groupe.</p>') + "</div></div>";
  }

  async function gNews(g) {
    var rows = await q(sb.from("announcements").select("*").eq("group_id", g.id).order("created_at", { ascending: false }).limit(100));
    var poster = can(g, ["proprietaire", "president", "secretaire"]) && writable(g);
    app.innerHTML = '<div class="stack" style="max-width:760px;margin:0 auto">' + head(g, "Annonces") +
      (poster ? '<form id="f-news" class="card stack" novalidate><h3>Nouvelle annonce</h3><div class="field"><label for="n-title">Titre</label><input id="n-title" type="text" maxlength="120" required></div>' +
        '<div class="field"><label for="n-body">Message</label><textarea id="n-body" maxlength="4000" required></textarea></div><div id="n-msg"></div><button class="btn btn-green" type="submit">Publier</button></form>' : "") +
      '<div class="card stack">' + (rows.length ? '<div class="list">' + rows.map(newsItem).join("") + "</div>" : '<p class="muted" style="margin:0">Aucune annonce.</p>') + "</div></div>";
  }

  async function gBureau(g) {
    if (!can(g, ["proprietaire", "president", "tresorier", "secretaire"])) { location.hash = "#/g/" + g.id; return; }
    var parts = [];
    if (can(g, ["proprietaire", "tresorier"])) {
      var proofs = await q(sb.from("payment_proofs").select("*").eq("group_id", g.id).eq("status", "en_attente").order("created_at").limit(100));
      var members = await rpc("group_members", { p_group: g.id });
      var names = {}; members.forEach(function (m) { names[m.user_id] = m.first_name + " " + m.last_name; });
      var ph = proofs.map(function (p) {
        return '<div class="item wrapitem"><div class="grow"><b>' + esc(names[p.user_id] || "Membre") + " · " + fcfa(p.amount) + '</b><span class="small muted">' + esc(METHODS[p.method]) + (p.period ? " · " + esc(periodLabel(p.period)) : "") + " · " + dtt(p.created_at) + "</span></div>" + (p.proof_path ? '<button class="btn btn-light btn-sm" data-act="file" data-path="' + esc(p.proof_path) + '">Voir la capture</button>' : '<span class="badge b-grey">Sans capture</span>') +
          (p.user_id === S.me.id ? '<span class="small muted">Ton paiement : un autre membre du bureau le valide</span>' : writable(g) ? '<button class="btn btn-green btn-sm" data-act="proof" data-id="' + esc(p.id) + '" data-d="valider">Valider</button><button class="btn btn-bad btn-sm" data-act="proof" data-id="' + esc(p.id) + '" data-d="refuser">Refuser</button>' : "") + "</div>";
      }).join("");
      parts.push('<div class="card stack"><h3>Paiements à vérifier (' + proofs.length + ")</h3>" + (ph ? '<p class="small muted" style="margin:0">Vérifie la capture et que l\'argent est bien arrivé sur le compte du groupe avant de valider.</p><div class="list">' + ph + "</div>" : '<p class="muted" style="margin:0">Aucun paiement en attente. 👍</p>') + "</div>");
    }
    if (g.pendingMembers) parts.push('<a class="card row" href="#/g/' + g.id + '/membres" style="text-decoration:none;color:inherit;justify-content:space-between"><b>' + g.pendingMembers + " demande(s) d'adhésion à traiter</b><span class=\"btn btn-gold btn-sm\">Voir</span></a>");
    if (can(g, ["proprietaire", "president", "tresorier"])) parts.push('<a class="card row" href="#/g/' + g.id + '/reglages" style="text-decoration:none;color:inherit;justify-content:space-between"><b>' + ICON.gear + " Réglages et abonnement</b>" + stateBadge(g.state) + "</a>");
    var log = await q(sb.from("audit_log").select("*").eq("group_id", g.id).order("created_at", { ascending: false }).limit(60));
    parts.push('<div class="card stack"><h3>Journal du groupe</h3><p class="small muted" style="margin:0">Toutes les actions du bureau, ineffaçables.</p><div class="list">' +
      (log.map(function (l) { return '<div class="item"><div class="grow"><b>' + esc(actionLabel(l.action)) + '</b><span class="small muted">' + dtt(l.created_at) + detailText(l.details) + "</span></div></div>"; }).join("") || '<p class="muted">Rien pour le moment.</p>') + "</div></div>");
    app.innerHTML = '<div class="stack">' + head(g, "Espace bureau") + stateBanner(g) + parts.join("") + "</div>";
  }
  var ACTIONS = {
    groupe_cree: "Groupe créé", demande_adhesion: "Demande d'adhésion", membre_accepter: "Membre accepté", membre_refuser: "Demande refusée", membre_retirer: "Membre retiré",
    membre_parti: "Membre parti", role_change: "Rôle modifié", groupe_modifie: "Réglages modifiés", numero_paiement_change: "Numéro de paiement changé", preuve_envoyee: "Capture envoyée",
    preuve_valider: "Paiement validé", preuve_refuser: "Paiement refusé", caisse_annulation: "Opération annulée", annonce_publiee: "Annonce publiée", abonnement_envoye: "Abonnement envoyé",
    abonnement_valider: "Abonnement validé", abonnement_offrir: "Abonnement offert", abonnement_refuser: "Abonnement refusé", groupe_suspendu: "Groupe suspendu", groupe_reactive: "Groupe réactivé",
    tarif_modifie: "Tarif modifié", reglage_modifie: "Réglage modifié", membres_ajoutes: "Membres ajoutés", fiche_modifiee: "Fiche membre corrigée",
    groupe_lance: "Groupe lancé", invitation_creee: "Invitation envoyée", invitation_acceptee: "Invitation acceptée", code_active: "Code du groupe activé",
    code_desactive: "Code du groupe désactivé", code_renouvele: "Nouveau code du groupe", reinitialisation_creee: "Lien mot de passe créé", mot_de_passe_reinitialise: "Mot de passe changé"
  };
  function actionLabel(a) { if (ACTIONS[a]) return ACTIONS[a]; if (/^caisse_/.test(a)) return "Caisse : " + (KINDS[a.slice(7)] || a.slice(7)); return a; }
  function detailText(d) {
    if (!d) return "";
    var out = [];
    if (d.montant) out.push(fcfa(d.montant));
    if (d.libelle) out.push(d.libelle);
    if (d.nom) out.push(d.nom);
    if (d.nombre) out.push(d.nombre + " membre(s)");
    if (d.role) out.push(ROLES[d.role] || d.role);
    if (d.raison) out.push("raison : " + d.raison);
    if (d.formule) out.push("formule " + d.formule);
    if (d.wave_apres !== undefined) out.push("Wave : " + (d.wave_apres ? showPhone(d.wave_apres) : "aucun"));
    return out.length ? " · " + esc(out.join(" · ")) : "";
  }

  async function gSettings(g) {
    if (!can(g, ["proprietaire", "president", "tresorier"])) { location.hash = "#/g/" + g.id; return; }
    var editor = can(g, ["proprietaire", "president"]) && writable(g);
    await loadPlans();
    var subs = await q(sb.from("subscription_payments").select("*").eq("group_id", g.id).order("created_at", { ascending: false }).limit(20));
    var pendingSub = subs.some(function (s) { return s.status === "en_attente"; });
    var mbWave = S.settings.wave_number;
    var plan = S.plans.find(function (p) { return p.id === g.plan_id; });
    var planChoices = S.plans.map(function (p, i) { return '<button type="button" data-act="pick" data-name="plan" data-val="' + esc(p.id) + '" class="' + ((g.plan_id ? p.id === g.plan_id : i === 0) ? "on" : "") + '">' + esc(p.name) + "<br><small>" + esc(p.max_members) + " membres</small></button>"; }).join("");
    var firstPlan = g.plan_id || (S.plans[0] && S.plans[0].id) || "";
    var statusInfo = g.state === "actif" ? "Abonnement actif jusqu'au <b>" + dt(g.paid_until) + "</b>" + (plan ? " · formule " + esc(plan.name) : "") :
      g.state === "essai" ? "Essai gratuit jusqu'au <b>" + dt(g.trial_ends_at) + "</b>" : g.state === "suspendu" ? "Groupe suspendu" : "Abonnement expiré : groupe en lecture seule";
    var subHist = subs.map(function (s) {
      var b = { en_attente: '<span class="badge b-warn">En vérification</span>', valide: '<span class="badge b-ok">Validé</span>', offert: '<span class="badge b-ok">Offert</span>', refuse: '<span class="badge b-bad">Refusé</span>' }[s.status];
      return '<div class="item"><div class="grow"><b>' + esc((S.plans.find(function (p) { return p.id === s.plan_id; }) || { name: s.plan_id }).name) + " · " + (s.months === 12 ? "1 an" : "1 mois") + " · " + fcfa(s.amount) + '</b><span class="small muted">' + dtt(s.created_at) + (s.note ? " · " + esc(s.note) : "") + "</span></div>" + b + "</div>";
    }).join("");
    app.innerHTML = '<div class="stack" style="max-width:760px;margin:0 auto">' + head(g, "Réglages") + stateBanner(g) +
      '<div class="card stack"><div class="row" style="justify-content:space-between"><h3>Abonnement du groupe</h3>' + stateBadge(g.state) + '</div><p style="margin:0">' + statusInfo + "</p>" +
      (g.state === "suspendu" || g.state === "preparation" ? (g.state === "preparation" ? '<p class="small muted" style="margin:0">L\'essai gratuit commencera au lancement du groupe.</p>' : "") : pendingSub ? '<div class="msg info">Ton paiement est en cours de vérification par Mbootaay.</div>' :
        '<form id="f-sub" class="stack" novalidate><input type="hidden" id="sb-plan" value="' + esc(firstPlan) + '"><input type="hidden" id="sb-months" value="12">' +
        '<div class="field"><label>Formule</label><div class="choice" data-group="plan">' + planChoices + "</div></div>" +
        '<div class="field"><label>Durée</label><div class="choice" data-group="months"><button type="button" data-act="pick" data-name="months" data-val="1">1 mois</button><button type="button" data-act="pick" data-name="months" data-val="12" class="on">1 an (2 mois offerts)</button></div></div>' +
        '<div class="msg ok" id="sb-price"></div>' +
        (mbWave ? '<div class="item"><div class="grow"><span class="small muted">Paie sur le Wave Mbootaay</span><b>' + esc(showPhone(mbWave)) + '</b></div><button class="btn btn-light btn-sm" type="button" data-act="copy" data-text="' + esc(digits(mbWave)) + '">Copier</button></div>' : '<p class="small muted" style="margin:0">Le numéro de paiement Mbootaay sera bientôt affiché ici.' + supportLink() + "</p>") +
        '<div class="field"><label>Capture du paiement</label><label class="drop" id="sb-drop" for="sb-file">' + ICON.camera + '<b>Ajouter la capture</b></label><input id="sb-file" class="sr" type="file" accept="image/*,application/pdf"></div>' +
        '<div id="sb-msg"></div><button class="btn btn-gold btn-block" type="submit">Envoyer le paiement</button></form>') +
      (subHist ? '<h3>Historique</h3><div class="list">' + subHist + "</div>" : "") + "</div>" +
      (can(g, ["proprietaire", "president"]) && g.state !== "preparation" ? '<div class="card stack"><h3>Code du groupe</h3><p class="small muted" style="margin:0">Le plus sûr : inviter chaque membre avec son lien personnel. Le code permet à quelqu\'un de <b>demander</b> à entrer ; le bureau doit accepter.</p>' +
        '<div class="row" style="justify-content:space-between"><span>' + (g.join_code_enabled ? 'Code actif : <b style="letter-spacing:.14em">' + esc(g.invite_code) + "</b>" : "Code désactivé") + '</span><div class="row">' +
        '<button class="btn btn-sm ' + (g.join_code_enabled ? "btn-light" : "btn-green") + '" data-act="code" data-on="' + (g.join_code_enabled ? "0" : "1") + '">' + (g.join_code_enabled ? "Désactiver" : "Activer") + "</button>" +
        (g.join_code_enabled ? '<button class="btn btn-sm btn-light" data-act="code" data-on="1" data-new="1">Nouveau code</button>' : "") + "</div></div></div>" : "") +
      '<form id="f-gset" class="card stack" novalidate><h3>Informations du groupe</h3>' +
      (editor ? "" : '<p class="small muted" style="margin:0">Seuls le propriétaire et le président peuvent modifier ces informations.</p>') +
      '<fieldset style="border:0;padding:0;margin:0" class="stack"' + (editor ? "" : " disabled") + ">" +
      '<div class="field"><label for="gs-name">Nom</label><input id="gs-name" type="text" maxlength="80" value="' + esc(g.name) + '"></div>' +
      '<div class="grid2" style="gap:12px"><div class="field"><label for="gs-amount">Cotisation (F CFA)</label><input id="gs-amount" type="number" min="100" step="100" value="' + esc(g.contribution_amount || "") + '"></div>' +
      '<div class="field"><label for="gs-period">Fréquence</label><select id="gs-period">' + Object.keys(PERIODS).map(function (k) { return '<option value="' + k + '"' + (k === g.contribution_period ? " selected" : "") + ">" + esc(PERIODS[k]) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="gs-wave">Numéro Wave</label><input id="gs-wave" type="tel" inputmode="numeric" value="' + esc(g.wave_number ? digits(g.wave_number) : "") + '"></div>' +
      '<div class="field"><label for="gs-om">Numéro Orange Money</label><input id="gs-om" type="tel" inputmode="numeric" value="' + esc(g.om_number ? digits(g.om_number) : "") + '"></div></div>' +
      '<label class="row" style="gap:10px;font-weight:600"><input id="gs-phones" type="checkbox" style="width:22px;height:22px"' + (g.phones_visible ? " checked" : "") + "> Les membres voient les numéros de téléphone des autres</label>" +
      '<p class="small muted" style="margin:0">Tout changement de numéro de paiement est annoncé automatiquement à tous les membres.</p>' +
      '<div id="gs-msg"></div>' + (editor ? '<button class="btn btn-green" type="submit">Enregistrer</button>' : "") + "</fieldset></form></div>";
    updateSubPrice();
  }
  function updateSubPrice() {
    var box = document.getElementById("sb-price"); if (!box) return;
    var p = S.plans.find(function (x) { return x.id === document.getElementById("sb-plan").value; });
    var m = Number(document.getElementById("sb-months").value);
    if (!p) { box.textContent = ""; return; }
    box.innerHTML = "À payer : <b>" + fcfa(m === 12 ? p.price_year : p.price_month) + "</b> pour " + (m === 12 ? "1 an" : "1 mois") + " · jusqu'à " + esc(p.max_members) + " membres";
  }

  /* ---------------- Mon compte ---------------- */
  function viewProfile() {
    app.innerHTML = '<div class="stack" style="max-width:560px;margin:0 auto"><div class="pagehead"><a class="back" href="#/" aria-label="Retour">' + ICON.back + "</a><h1>Mon compte</h1></div>" +
      '<div class="card stack"><div class="row"><div class="avatar" style="width:56px;height:56px;font-size:1.2rem">' + esc(initials(S.me.first_name, S.me.last_name)) + '</div><div><b style="font-size:1.15rem">' + esc(S.me.first_name + " " + S.me.last_name) + '</b><div class="muted">' + esc(showPhone(S.me.phone)) + "</div></div></div>" +
      (S.owner ? '<span class="badge b-ok">Propriétaire de la plateforme</span>' : "") + "</div>" +
      '<form id="f-pass" class="card stack" novalidate><h3>Changer de mot de passe</h3>' + pwField("pw-new", "Nouveau mot de passe", "new-password") + pwField("pw-new2", "Confirme", "new-password") +
      '<div id="pw-msg"></div><button class="btn btn-green" type="submit">Mettre à jour</button></form>' +
      (S.settings.support_whatsapp ? '<a class="btn btn-light" target="_blank" rel="noopener" href="https://wa.me/' + esc(String(S.settings.support_whatsapp).replace(/\D/g, "")) + '">Contacter l\'assistance Mbootaay</a>' : "") +
      '<button class="btn btn-bad" data-act="logout">Se déconnecter</button></div>';
  }

  /* ---------------- Console du propriétaire ---------------- */
  async function viewConsole(tab) {
    loading();
    var tabs = [["tableau", "Tableau de bord"], ["abonnements", "Abonnements"], ["groupes", "Groupes"], ["tarifs", "Tarifs"], ["assistance", "Assistance"], ["reglages", "Réglages"], ["journal", "Journal"]];
    var d;
    try { d = await rpc("owner_dashboard"); } catch (e) { app.innerHTML = '<div class="msg err">' + esc(errText(e)) + "</div>"; return; }
    var nav = '<div class="tabs">' + tabs.map(function (t) {
      var b = t[0] === "abonnements" && d.pending_subscriptions ? ' <span class="badge" style="background:#E0352B;color:#fff;padding:2px 7px">' + esc(d.pending_subscriptions) + "</span>" : "";
      return '<a href="#/console/' + t[0] + '" class="' + (tab === t[0] ? "on" : "") + '">' + t[1] + b + "</a>";
    }).join("") + "</div>";
    var body = "";
    try {
      if (tab === "abonnements") body = await cSubs();
      else if (tab === "groupes") body = await cGroups();
      else if (tab === "tarifs") body = await cPlans();
      else if (tab === "reglages") body = cSettings();
      else if (tab === "journal") body = await cJournal();
      else if (tab === "assistance") body = cAssist();
      else body = cDash(d);
    } catch (e) { body = '<div class="msg err">' + esc(errText(e)) + "</div>"; }
    app.innerHTML = '<div class="stack"><div><p class="muted" style="margin:0">Console du propriétaire</p><h1>Mbootaay</h1></div>' + nav + body + "</div>";
  }
  function cDash(d) {
    var st = d.by_state || {}, ty = d.by_type || {};
    var max = Math.max.apply(null, [1].concat(Object.keys(ty).map(function (k) { return ty[k]; })));
    return '<div class="kpis"><div class="kpi k1"><small>Revenus du mois</small><b>' + fcfa(d.revenue_month) + '</b></div><div class="kpi k2"><small>Groupes</small><b>' + esc(d.groups) + '</b></div><div class="kpi k3"><small>Membres actifs</small><b>' + esc(d.members) + '</b></div><div class="kpi k4"><small>Comptes</small><b>' + esc(d.users) + "</b></div></div>" +
      '<div class="grid2"><div class="card stack"><h3>À traiter</h3><div class="list">' +
      '<a class="item" href="#/console/abonnements" style="text-decoration:none;color:inherit"><div class="grow"><b>Abonnements à vérifier</b></div><span class="badge ' + (d.pending_subscriptions ? "b-bad" : "b-ok") + '">' + esc(d.pending_subscriptions) + "</span></a>" +
      '<a class="item" href="#/console/groupes" style="text-decoration:none;color:inherit"><div class="grow"><b>Essais qui finissent sous 7 jours</b></div><span class="badge b-warn">' + esc(d.trials_ending_7d) + "</span></a>" +
      '<a class="item" href="#/console/groupes" style="text-decoration:none;color:inherit"><div class="grow"><b>Groupes en lecture seule</b></div><span class="badge b-grey">' + esc(st.lecture_seule || 0) + "</span></a>" +
      '<a class="item" href="#/console/groupes" style="text-decoration:none;color:inherit"><div class="grow"><b>Groupes vides (à aider)</b></div><span class="badge ' + (d.empty_groups ? "b-warn" : "b-ok") + '">' + esc(d.empty_groups || 0) + "</span></a>" +
      '<div class="item"><div class="grow"><b>Membres avec compte relié</b></div><b>' + esc(d.members_linked || 0) + " / " + esc(d.members) + "</b></div></div></div>" +
      '<div class="card stack"><h3>Groupes par état</h3><div class="list">' + ["preparation", "essai", "actif", "lecture_seule", "suspendu"].map(function (k) { return '<div class="item"><div class="grow">' + stateBadge(k) + "</div><b>" + esc(st[k] || 0) + "</b></div>"; }).join("") + "</div>" +
      '<p class="small muted" style="margin:0">Revenus encaissés depuis le début : <b>' + fcfa(d.revenue_total) + "</b> (les abonnements offerts ne sont pas comptés).</p></div>" +
      '<div class="card stack"><h3>Groupes par type</h3>' + (Object.keys(ty).length ? Object.keys(ty).sort(function (a, b) { return ty[b] - ty[a]; }).map(function (k) {
        var t = typeOf(k);
        return '<div><div class="row" style="justify-content:space-between"><span>' + esc(t.label) + "</span><b>" + esc(ty[k]) + '</b></div><div style="height:12px;border-radius:8px;background:#EEF3F0"><div style="height:12px;border-radius:8px;width:' + Math.round(ty[k] / max * 100) + "%;background:" + t.color + '"></div></div></div>';
      }).join("") : '<p class="muted" style="margin:0">Aucun groupe pour le moment.</p>') + "</div></div>";
  }
  async function cSubs() {
    var rows = await q(sb.from("subscription_payments").select("*, groups(name,type)").order("created_at", { ascending: false }).limit(100));
    await loadPlans();
    var pend = rows.filter(function (r) { return r.status === "en_attente"; });
    var done = rows.filter(function (r) { return r.status !== "en_attente"; });
    function line(r, tools) {
      var pl = (S.plans.find(function (p) { return p.id === r.plan_id; }) || { name: r.plan_id }).name;
      return '<div class="item wrapitem"><div class="grow"><b>' + esc(r.groups ? r.groups.name : "Groupe") + " · " + fcfa(r.amount) + '</b><span class="small muted">' + esc(pl) + " · " + (r.months === 12 ? "1 an" : "1 mois") + " · " + dtt(r.created_at) + (r.note ? " · " + esc(r.note) : "") + "</span></div>" +
        (r.proof_path ? '<button class="btn btn-light btn-sm" data-act="file" data-path="' + esc(r.proof_path) + '">Capture</button>' : "") + tools + "</div>";
    }
    return '<div class="card stack"><h3>À vérifier (' + pend.length + ")</h3>" + (pend.length ? '<div class="list">' + pend.map(function (r) {
      return line(r, '<button class="btn btn-green btn-sm" data-act="sub" data-id="' + esc(r.id) + '" data-d="valider">Valider</button><button class="btn btn-light btn-sm" data-act="sub" data-id="' + esc(r.id) + '" data-d="offrir">Offrir</button><button class="btn btn-bad btn-sm" data-act="sub" data-id="' + esc(r.id) + '" data-d="refuser">Refuser</button>');
    }).join("") + "</div>" : '<p class="muted" style="margin:0">Rien à vérifier. 👍</p>') +
      '<p class="small muted" style="margin:0">« Offrir » active l\'abonnement sans le compter dans les revenus.</p></div>' +
      '<div class="card stack"><h3>Déjà traités</h3>' + (done.length ? '<div class="list">' + done.map(function (r) {
        var b = { valide: '<span class="badge b-ok">Validé</span>', offert: '<span class="badge b-warn">Offert</span>', refuse: '<span class="badge b-bad">Refusé</span>' }[r.status];
        return line(r, b);
      }).join("") + "</div>" : '<p class="muted" style="margin:0">Aucun.</p>') + "</div>";
  }
  async function cGroups() {
    var rows = await rpc("owner_groups");
    var filter = sessionStorage.getItem("mb_cg_filter") || "";
    var list = rows.filter(function (g) {
      if (!filter) return true;
      if (filter === "vide") return g.state !== "preparation" && Number(g.members) <= 1 && Number(g.operations) === 0;
      return g.state === filter;
    });
    return '<div class="card stack"><div class="row" style="justify-content:space-between"><h3>' + rows.length + ' groupes</h3><select data-act="cg-filter" style="width:auto"><option value="">Tous</option>' +
      ["preparation", "essai", "actif", "lecture_seule", "suspendu"].map(function (k) { return '<option value="' + k + '"' + (k === filter ? " selected" : "") + ">" + esc(STATES[k][1]) + "</option>"; }).join("") +
      '<option value="vide"' + (filter === "vide" ? " selected" : "") + ">Groupes vides</option></select></div>" +
      '<div class="tscroll"><table class="t"><thead><tr><th>Groupe</th><th>État</th><th>Membres</th><th>Échéance</th><th></th></tr></thead><tbody>' +
      list.map(function (g) {
        var empty = g.state !== "preparation" && Number(g.members) <= 1 && Number(g.operations) === 0;
        return "<tr><td><b>" + esc(g.name) + '</b><div class="small muted">' + esc(typeOf(g.type).label) + " · " + esc(g.owner_name || "—") + (g.owner_phone ? " · " + esc(showPhone(g.owner_phone)) : "") + "<br>créé le " + dt(g.created_at) + "</div></td><td>" + stateBadge(g.state) + (empty ? ' <span class="badge b-bad">Vide</span>' : "") + "</td>" +
          "<td><b>" + esc(g.members) + '</b><div class="small muted">' + esc(g.linked) + " relié(s) · " + esc(g.operations) + " op.</div></td><td>" + (g.state === "preparation" ? "—" : dt(g.paid_until || g.trial_ends_at)) + "</td><td>" +
          (g.owner_phone ? '<a class="btn btn-sm btn-light" target="_blank" rel="noopener" href="https://wa.me/' + esc(String(g.owner_phone).replace(/\D/g, "")) + '">WhatsApp</a> ' : "") +
          '<button class="btn btn-sm ' + (g.is_suspended ? "btn-green" : "btn-bad") + '" data-act="suspend" data-id="' + esc(g.id) + '" data-s="' + (g.is_suspended ? "0" : "1") + '">' + (g.is_suspended ? "Réactiver" : "Suspendre") + "</button></td></tr>";
      }).join("") + "</tbody></table></div>" + (list.length ? "" : '<p class="muted">Aucun groupe.</p>') + "</div>";
  }
  function cAssist() {
    return '<form id="f-assist" class="card stack" novalidate><h3>Mot de passe oublié</h3><p class="small muted" style="margin:0">Crée un lien personnel (valable 24 h) pour qu\'une personne choisisse un nouveau mot de passe. Toutes ses connexions en cours seront fermées.</p>' +
      '<div class="field"><label for="as-phone">Numéro du compte</label><input id="as-phone" type="tel" inputmode="numeric" placeholder="77 123 45 67"></div>' +
      '<div id="as-msg"></div><button class="btn btn-green" type="submit">Créer le lien</button></form>';
  }
  async function cPlans() {
    await loadPlans();
    function form(p, isNew) {
      p = p || { id: "", name: "", max_members: 50, price_month: 0, price_year: 0, position: S.plans.length + 1, is_active: true };
      return '<form class="card stack" data-form="plan" novalidate><div class="row" style="justify-content:space-between"><h3>' + (isNew ? "Nouvelle formule" : esc(p.name)) + "</h3>" + (isNew ? "" : p.is_active ? '<span class="badge b-ok">Proposée</span>' : '<span class="badge b-grey">Masquée</span>') + "</div>" +
        '<div class="grid2" style="gap:12px">' +
        '<div class="field"><label>Identifiant</label><input name="id" type="text" maxlength="30" value="' + esc(p.id) + '"' + (isNew ? ' placeholder="ex. premium"' : " readonly") + "></div>" +
        '<div class="field"><label>Nom affiché</label><input name="name" type="text" maxlength="40" value="' + esc(p.name) + '"></div>' +
        '<div class="field"><label>Membres maximum</label><input name="max" type="number" min="1" value="' + esc(p.max_members) + '"></div>' +
        '<div class="field"><label>Ordre</label><input name="pos" type="number" min="0" value="' + esc(p.position) + '"></div>' +
        '<div class="field"><label>Prix par mois (F)</label><input name="month" type="number" min="0" step="100" value="' + esc(p.price_month) + '"></div>' +
        '<div class="field"><label>Prix par an (F)</label><input name="year" type="number" min="0" step="100" value="' + esc(p.price_year) + '"></div></div>' +
        '<label class="row" style="gap:10px;font-weight:600"><input name="active" type="checkbox" style="width:22px;height:22px"' + (p.is_active ? " checked" : "") + "> Proposer cette formule aux groupes</label>" +
        '<button class="btn btn-green" type="submit">Enregistrer</button></form>';
    }
    return '<p class="muted" style="margin:0">Les prix s\'appliquent aux prochains paiements. Les groupes déjà abonnés gardent leur échéance.</p><div class="grid2">' + S.plans.map(function (p) { return form(p, false); }).join("") + form(null, true) + "</div>";
  }
  function cSettings() {
    var s = S.settings;
    function num(key, label, help) { return '<div class="field"><label for="st-' + key + '">' + label + '</label><input id="st-' + key + '" data-key="' + key + '" type="number" min="0" value="' + esc(s[key] == null ? "" : s[key]) + '"><small>' + help + "</small></div>"; }
    function tel(key, label, help) { return '<div class="field"><label for="st-' + key + '">' + label + '</label><input id="st-' + key + '" data-key="' + key + '" data-tel="1" type="tel" inputmode="numeric" value="' + esc(s[key] ? digits(s[key]) : "") + '"><small>' + help + "</small></div>"; }
    return '<form id="f-settings" class="card stack" novalidate><h3>Réglages de la plateforme</h3><div class="grid2" style="gap:12px">' +
      num("trial_days", "Jours d'essai gratuit", "Pour les nouveaux groupes.") +
      num("readonly_days", "Jours de lecture seule", "Après expiration, avant archivage.") +
      num("referral_months", "Mois offerts par parrainage", "Récompense de parrainage.") +
      num("max_groups_per_user", "Groupes max par compte", "Limite anti-abus.") +
      tel("wave_number", "Numéro Wave de Mbootaay", "Affiché aux groupes pour payer l'abonnement.") +
      tel("support_whatsapp", "WhatsApp de l'assistance", "Lien « Contacter l'assistance ».") +
      '</div><div id="st-msg"></div><button class="btn btn-green" type="submit">Enregistrer les réglages</button></form>';
  }
  async function cJournal() {
    var rows = await q(sb.from("audit_log").select("*, groups(name)").order("created_at", { ascending: false }).limit(150));
    return '<div class="card stack"><h3>Journal de la plateforme</h3><div class="list">' + (rows.map(function (l) {
      return '<div class="item"><div class="grow"><b>' + esc(actionLabel(l.action)) + (l.groups ? " · " + esc(l.groups.name) : "") + '</b><span class="small muted">' + dtt(l.created_at) + detailText(l.details) + (!l.group_id && l.target ? " · " + esc(l.target) : "") + "</span></div></div>";
    }).join("") || '<p class="muted">Vide.</p>') + "</div></div>";
  }

  /* ---------------- Fenêtres (partage, édition) ---------------- */
  function baseUrl() { return location.origin + location.pathname; }
  function openSheet(html) {
    closeSheet();
    var m = document.createElement("div");
    m.className = "modal"; m.id = "sheet"; m.setAttribute("role", "dialog");
    m.innerHTML = '<div class="card stack sheet">' + html + '<button class="btn btn-light" data-act="close-modal">Fermer</button></div>';
    document.body.appendChild(m);
  }
  function closeSheet() { var x = document.getElementById("sheet"); if (x) x.remove(); }
  function shareItem(it) {
    var wa = "https://wa.me/" + (it.phone ? "221" + digits(it.phone) : "") + "?text=" + encodeURIComponent(it.text);
    return '<div class="item wrapitem"><div class="grow"><b>' + esc(it.name) + '</b><span class="small muted">' + esc(it.phone ? showPhone(it.phone) : "") + "</span></div>" +
      '<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="' + esc(wa) + '" data-act="sent">' + ICON.share + " WhatsApp</a>" +
      '<button class="btn btn-light btn-sm" data-act="copy" data-text="' + esc(it.text) + '">Copier</button></div>';
  }
  function inviteText(g, m, tok) {
    return "Bonjour " + m.first_name + ", tu es invité(e) dans le groupe « " + g.name + " » sur Mbootaay. Ouvre ton lien personnel (valable 7 jours, ne le transfère à personne) : " + baseUrl() + "#/invitation/" + tok;
  }
  function parseList(txt) {
    var out = [], errors = [];
    txt.split(/\r?\n/).forEach(function (line, i) {
      var l = line.trim(); if (!l) return;
      var m = /^(.*?)[\s,;:-]*((?:\+?221[\s.-]*)?7[0-8](?:[\s.-]*\d){7})?\s*$/.exec(l);
      var names = (m[1] || "").replace(/[,;]+/g, " ").trim().split(/\s+/).filter(Boolean);
      if (names.length < 2) { errors.push("Ligne " + (i + 1) + " : prénom et nom obligatoires"); return; }
      out.push({ first_name: names[0], last_name: names.slice(1).join(" "), phone: m[2] ? digits(m[2]) : "" });
    });
    return { list: out, errors: errors };
  }

  /* ---------------- Formulaires ---------------- */
  function msg(id, text, kind) { var b = document.getElementById(id); if (b) b.innerHTML = text ? '<div class="msg ' + (kind || "err") + '">' + esc(text) + "</div>" : ""; }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }

  document.addEventListener("submit", async function (e) {
    var f = e.target;
    e.preventDefault();
    var btn = f.querySelector("button[type=submit]");
    try {
      if (f.id === "f-login") {
        var d = digits(val("l-phone"));
        if (!validPhone(d)) return msg("l-msg", "Numéro invalide : 9 chiffres commençant par 7.");
        if (!val("l-pass")) return msg("l-msg", "Entre ton mot de passe.");
        lockBtn(btn, true, "Connexion…");
        var r = await sb.auth.signInWithPassword({ email: d + "@" + C.EMAIL_DOMAIN, password: document.getElementById("l-pass").value });
        if (r.error) throw r.error;
        await loadMe(); location.hash = "#/"; route();
      } else if (f.id === "f-signup") {
        var fn = val("s-first"), ln = val("s-last"), ph = digits(val("s-phone")), p1 = document.getElementById("s-pass").value, p2 = document.getElementById("s-pass2").value;
        if (!fn || !ln) return msg("s-msg", "Entre ton prénom et ton nom.");
        if (!validPhone(ph)) return msg("s-msg", "Numéro invalide : 9 chiffres commençant par 7 (ex. 77 123 45 67).");
        if (p1.length < 8) return msg("s-msg", "Le mot de passe doit contenir au moins 8 caractères.");
        if (p1 !== p2) return msg("s-msg", "Les deux mots de passe ne sont pas identiques.");
        lockBtn(btn, true, "Création…");
        var s = await sb.auth.signUp({ email: ph + "@" + C.EMAIL_DOMAIN, password: p1, options: { data: { first_name: fn, last_name: ln, phone: ph } } });
        if (s.error) throw s.error;
        if (!s.data.session) {
          var li = await sb.auth.signInWithPassword({ email: ph + "@" + C.EMAIL_DOMAIN, password: p1 });
          if (li.error) { msg("s-msg", "Compte créé. Il doit encore être activé : contacte l'assistance Mbootaay.", "info"); return; }
        }
        await loadMe(); toast("Bienvenue sur Mbootaay, " + fn + " !", "ok"); location.hash = "#/"; route();
      } else if (f.id === "f-add1") {
        var af = val("a-first"), al = val("a-last"), ap = val("a-phone");
        if (!af || !al) return msg("a-msg", "Entre le prénom et le nom.");
        if (ap && !validPhone(ap)) return msg("a-msg", "Numéro invalide : 9 chiffres commençant par 7.");
        lockBtn(btn, true, "Ajout…");
        await rpc("add_members", { p_group: S.g.id, p_members: [{ first_name: af, last_name: al, phone: ap ? digits(ap) : "" }] });
        toast(af + " " + al + " ajouté(e)", "ok"); refreshGroup();
      } else if (f.id === "f-addlist") {
        var parsed = parseList(document.getElementById("a-list").value);
        if (parsed.errors.length) return msg("al-msg", parsed.errors.slice(0, 3).join(" · "));
        if (!parsed.list.length) return msg("al-msg", "La liste est vide.");
        var bad = parsed.list.filter(function (x) { return x.phone && !validPhone(x.phone); });
        if (bad.length) return msg("al-msg", "Numéro invalide pour " + bad[0].first_name + " " + bad[0].last_name);
        S.pendingList = parsed.list;
        openSheet("<h3>Vérifie la liste (" + parsed.list.length + ")</h3><div class=\"list\" style=\"max-height:50vh;overflow:auto\">" + parsed.list.map(function (x) {
          return '<div class="item"><div class="grow"><b>' + esc(x.first_name + " " + x.last_name) + '</b><span class="small muted">' + esc(x.phone ? showPhone(x.phone) : "sans téléphone") + "</span></div></div>";
        }).join("") + '</div><button class="btn btn-gold" data-act="add-list-confirm">Ajouter ces ' + parsed.list.length + " membres</button>");
      } else if (f.id === "f-edit") {
        var ep = val("e-phone");
        if (!val("e-first") || !val("e-last")) return msg("e-msg", "Prénom et nom obligatoires.");
        if (ep && !validPhone(ep)) return msg("e-msg", "Numéro invalide.");
        lockBtn(btn, true);
        await rpc("update_member_info", { p_member: f.dataset.member, p_first: val("e-first"), p_last: val("e-last"), p_phone: ep ? digits(ep) : null });
        closeSheet(); toast("Fiche corrigée", "ok"); refreshGroup();
      } else if (f.id === "f-inv-login") {
        lockBtn(btn, true, "Connexion…");
        var il = await sb.auth.signInWithPassword({ email: S.inv.p.phone + "@" + C.EMAIL_DOMAIN, password: document.getElementById("i-pass").value });
        if (il.error) throw il.error;
        await loadMe(); await acceptInvite();
      } else if (f.id === "f-inv-signup") {
        var ifn = val("i-first"), iln = val("i-last"), iph = digits(val("i-phone")), ip1 = document.getElementById("i-pass").value, ip2 = document.getElementById("i-pass2").value;
        if (!ifn || !iln) return msg("i-msg", "Entre ton prénom et ton nom.");
        if (!validPhone(iph)) return msg("i-msg", "Numéro invalide : 9 chiffres commençant par 7.");
        if (ip1.length < 8) return msg("i-msg", "Le mot de passe doit contenir au moins 8 caractères.");
        if (ip1 !== ip2) return msg("i-msg", "Les deux mots de passe ne sont pas identiques.");
        lockBtn(btn, true, "Création…");
        var su = await sb.auth.signUp({ email: iph + "@" + C.EMAIL_DOMAIN, password: ip1, options: { data: { first_name: ifn, last_name: iln, phone: iph } } });
        if (su.error) throw su.error;
        if (!su.data.session) { var sl = await sb.auth.signInWithPassword({ email: iph + "@" + C.EMAIL_DOMAIN, password: ip1 }); if (sl.error) throw sl.error; }
        await loadMe(); await acceptInvite();
      } else if (f.id === "f-reset") {
        var r1 = document.getElementById("r-pass").value, r2 = document.getElementById("r-pass2").value;
        if (r1.length < 8) return msg("r-msg", "8 caractères minimum.");
        if (r1 !== r2) return msg("r-msg", "Les deux mots de passe ne sont pas identiques.");
        lockBtn(btn, true);
        await rpc("reset_password", { p_token: S.reset.token, p_password: r1 });
        if (S.session) { await sb.auth.signOut(); S.session = null; S.me = null; S.owner = false; }
        var rp = S.reset.phone; S.reset = null;
        toast("Mot de passe enregistré : connecte-toi", "ok");
        location.hash = "#/connexion";
        setTimeout(function () { var x = document.getElementById("l-phone"); if (x) x.value = showPhone(rp); }, 300);
      } else if (f.id === "f-assist") {
        var aph = val("as-phone");
        if (!validPhone(aph)) return msg("as-msg", "Numéro invalide.");
        lockBtn(btn, true);
        var atok = await rpc("owner_reset_link", { p_phone: digits(aph) });
        openSheet("<h3>Lien prêt (24 h)</h3>" + shareItem({ name: "Compte " + showPhone(aph), phone: digits(aph), text: "Bonjour, voici ton lien personnel pour choisir un nouveau mot de passe Mbootaay (valable 24 h) : " + baseUrl() + "#/reinitialiser/" + atok }));
      } else if (f.id === "f-create") {
        var name = val("c-name"), amt = val("c-amount"), wave = val("c-wave");
        if (name.length < 3) return msg("c-msg", "Le nom du groupe doit contenir au moins 3 caractères.");
        if (amt && (Number(amt) < 100 || !Number.isFinite(Number(amt)))) return msg("c-msg", "La cotisation doit être d'au moins 100 F.");
        if (wave && !validPhone(wave)) return msg("c-msg", "Numéro Wave invalide.");
        lockBtn(btn, true, "Création…");
        var gid = await rpc("create_group", { p_type: val("c-type"), p_name: name, p_amount: amt ? Math.round(Number(amt)) : null, p_period: val("c-period"), p_wave: wave ? digits(wave) : null });
        toast("Groupe créé ! Invite maintenant tes membres.", "ok");
        location.hash = "#/g/" + gid;
      } else if (f.id === "f-join") {
        var code = val("j-code").toUpperCase().replace(/[^A-Z2-9]/g, "");
        if (code.length !== 8) return msg("j-msg", "Le code contient 8 caractères.");
        await doJoin(code, btn);
      } else if (f.id === "f-pay") {
        var g = S.g, pa = Number(val("p-amount")), pm = val("p-method");
        if (!(pa >= 1)) return msg("p-msg", "Indique le montant payé.");
        if ((pm === "wave" || pm === "orange_money") && !pickedFile) return msg("p-msg", "Ajoute la capture du paiement.");
        lockBtn(btn, true, "Envoi…");
        var path = null;
        if (pickedFile) path = await uploadProof(g.id, await prepareFile(pickedFile));
        await rpc("submit_proof", { p_group: g.id, p_amount: Math.round(pa), p_method: pm, p_period: val("p-period") || null, p_proof_path: path });
        pickedFile = null; toast("Capture envoyée au trésorier", "ok"); refreshGroup();
      } else if (f.id === "f-ledger") {
        var lk = val("le-kind"), la = Number(val("le-amount")), ll = val("le-label");
        if (!(la >= 1)) return msg("le-msg", "Indique le montant.");
        if (ll.length < 2) return msg("le-msg", "Indique un libellé.");
        if ((lk === "cotisation" || lk === "tour") && !val("le-member")) return msg("le-msg", "Choisis le membre concerné.");
        lockBtn(btn, true, "Enregistrement…");
        var lp = null;
        if (pickedFile) lp = await uploadProof(S.g.id, await prepareFile(pickedFile));
        await rpc("add_ledger_entry", { p_group: S.g.id, p_kind: lk, p_amount: Math.round(la), p_member: val("le-member") || null, p_period: val("le-period") || null, p_label: ll, p_proof_path: lp });
        pickedFile = null; toast("Opération enregistrée", "ok"); refreshGroup();
      } else if (f.id === "f-news") {
        var nt = val("n-title"), nb = val("n-body");
        if (nt.length < 2 || !nb) return msg("n-msg", "Remplis le titre et le message.");
        lockBtn(btn, true, "Publication…");
        await rpc("post_announcement", { p_group: S.g.id, p_title: nt, p_body: nb });
        toast("Annonce publiée", "ok"); refreshGroup();
      } else if (f.id === "f-gset") {
        var w = val("gs-wave"), o = val("gs-om"), ga = val("gs-amount");
        if (val("gs-name").length < 3) return msg("gs-msg", "Nom trop court.");
        if (w && !validPhone(w)) return msg("gs-msg", "Numéro Wave invalide.");
        if (o && !validPhone(o)) return msg("gs-msg", "Numéro Orange Money invalide.");
        var changing = (digits(w) || null) !== (S.g.wave_number ? digits(S.g.wave_number) : null) || (digits(o) || null) !== (S.g.om_number ? digits(S.g.om_number) : null);
        if (changing && !confirm("Le numéro de paiement va changer. Une annonce sera envoyée à tous les membres. Continuer ?")) return;
        lockBtn(btn, true);
        await rpc("update_group", { p_group: S.g.id, p_name: val("gs-name"), p_amount: ga ? Math.round(Number(ga)) : null, p_period: val("gs-period"), p_wave: w ? digits(w) : null, p_om: o ? digits(o) : null, p_phones_visible: document.getElementById("gs-phones").checked });
        toast("Réglages enregistrés", "ok"); refreshGroup();
      } else if (f.id === "f-sub") {
        if (!pickedFile) return msg("sb-msg", "Ajoute la capture du paiement.");
        lockBtn(btn, true, "Envoi…");
        var sp = await uploadProof(S.g.id, await prepareFile(pickedFile));
        await rpc("submit_subscription", { p_group: S.g.id, p_plan: val("sb-plan"), p_months: Number(val("sb-months")), p_proof_path: sp });
        pickedFile = null; toast("Paiement envoyé : Mbootaay va le vérifier", "ok"); refreshGroup();
      } else if (f.id === "f-pass") {
        var n1 = document.getElementById("pw-new").value, n2 = document.getElementById("pw-new2").value;
        if (n1.length < 8) return msg("pw-msg", "8 caractères minimum.");
        if (n1 !== n2) return msg("pw-msg", "Les deux mots de passe ne sont pas identiques.");
        lockBtn(btn, true);
        var u = await sb.auth.updateUser({ password: n1 });
        if (u.error) throw u.error;
        f.reset(); msg("pw-msg", "Mot de passe mis à jour.", "ok");
      } else if (f.dataset.form === "plan") {
        var fd = new FormData(f);
        var pid = String(fd.get("id") || "").trim().toLowerCase();
        if (!/^[a-z0-9_-]{2,30}$/.test(pid)) { toast("Identifiant : lettres minuscules, chiffres, - ou _", "err"); return; }
        lockBtn(btn, true);
        await rpc("owner_save_plan", { p_id: pid, p_name: String(fd.get("name") || "").trim(), p_max: Number(fd.get("max")), p_month: Number(fd.get("month")), p_year: Number(fd.get("year")), p_position: Number(fd.get("pos")) || 0, p_active: !!fd.get("active") });
        toast("Formule enregistrée", "ok"); route();
      } else if (f.id === "f-settings") {
        lockBtn(btn, true);
        var inputs = f.querySelectorAll("input[data-key]");
        for (var i = 0; i < inputs.length; i++) {
          var inp = inputs[i], key = inp.dataset.key, v = inp.value.trim(), cur = S.settings[key];
          var value;
          if (inp.dataset.tel) { if (v && !validPhone(v)) throw new Error("Numéro invalide : " + inp.previousElementSibling.textContent); value = v ? digits(v) : null; if ((cur ? digits(cur) : null) === value) continue; }
          else { if (v === "") continue; value = Math.round(Number(v)); if (Number(cur) === value) continue; }
          await rpc("owner_set_setting", { p_key: key, p_value: value });
        }
        await loadSettings(); msg("st-msg", "Réglages enregistrés.", "ok");
      }
    } catch (err) {
      var box = f.querySelector("[id$=-msg]");
      if (box) box.innerHTML = '<div class="msg err">' + esc(errText(err)) + "</div>"; else toast(errText(err), "err");
    } finally { lockBtn(btn, false); }
  });

  /* ---------------- Clics ---------------- */
  document.addEventListener("click", async function (e) {
    var el = e.target.closest("[data-act]");
    if (!el) { if (e.target.classList && e.target.classList.contains("modal")) e.target.remove(); return; }
    var a = el.dataset.act;
    if (a === "role" || a === "cg-filter") return;
    try {
      if (a === "eye") {
        var inp = document.getElementById(el.dataset.for);
        var show = inp.type === "password";
        inp.type = show ? "text" : "password";
        el.innerHTML = show ? ICON.eyeOff : ICON.eye;
        el.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
      } else if (a === "pick") {
        var wrap = el.parentElement;
        wrap.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b === el); });
        var hid = { type: "c-type", method: "p-method", plan: "sb-plan", months: "sb-months" }[el.dataset.name];
        if (hid) document.getElementById(hid).value = el.dataset.val;
        updateSubPrice();
      } else if (a === "logout") {
        await sb.auth.signOut(); S.session = null; S.me = null; S.owner = false; S.g = null; location.hash = "#/"; route();
      } else if (a === "copy") {
        var t = el.dataset.text;
        try { await navigator.clipboard.writeText(t); } catch (x) {
          var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
        }
        toast("Copié", "ok");
      } else if (a === "file") {
        viewFile(el.dataset.path);
      } else if (a === "close-modal") {
        el.closest(".modal").remove();
        if (S.g && S.g._t === 0) refreshGroup();
      } else if (a === "ledger-filter") {
        sessionStorage.setItem("mb_ledger_mine", el.dataset.mine); route();
      } else if (a === "reverse") {
        var reason = prompt("Pourquoi annuler cette opération ? (visible par tous les membres)");
        if (reason === null) return;
        if (reason.trim().length < 3) { toast("Indique une raison (3 caractères minimum)", "err"); return; }
        el.disabled = true;
        await rpc("reverse_ledger_entry", { p_entry: Number(el.dataset.id), p_reason: reason.trim() });
        toast("Opération annulée", "ok"); refreshGroup();
      } else if (a === "member") {
        var d = el.dataset.d;
        if (d === "retirer" && !confirm("Retirer ce membre du groupe ?")) return;
        el.disabled = true;
        await rpc("review_member", { p_member: el.dataset.member, p_decision: d });
        toast(d === "accepter" ? "Membre accepté" : d === "refuser" ? "Demande refusée" : "Membre retiré", "ok"); refreshGroup();
      } else if (a === "leave") {
        if (!confirm("Quitter ce groupe ? Ton historique de cotisations reste dans la caisse.")) return;
        await rpc("leave_group", { p_group: S.g.id });
        toast("Tu as quitté le groupe", "ok"); S.g = null; location.hash = "#/";
      } else if (a === "proof") {
        var pd = el.dataset.d, note = null;
        if (pd === "refuser") { note = prompt("Raison du refus (le membre la verra) :"); if (note === null) return; }
        el.disabled = true;
        await rpc("review_proof", { p_proof: el.dataset.id, p_decision: pd, p_note: note });
        toast(pd === "valider" ? "Paiement validé et ajouté à la caisse" : "Paiement refusé", "ok"); refreshGroup();
      } else if (a === "sub") {
        var sd = el.dataset.d, sn = null;
        if (sd === "refuser") { sn = prompt("Raison du refus :"); if (sn === null) return; }
        if (sd === "offrir" && !confirm("Offrir cet abonnement ? Il ne sera pas compté dans les revenus.")) return;
        el.disabled = true;
        await rpc("owner_review_subscription", { p_payment: el.dataset.id, p_decision: sd, p_note: sn });
        toast("Abonnement traité", "ok"); route();
      } else if (a === "suspend") {
        var on = el.dataset.s === "1", why = null;
        if (on) { why = prompt("Raison de la suspension :"); if (why === null) return; }
        el.disabled = true;
        await rpc("owner_set_suspended", { p_group: el.dataset.id, p_suspended: on, p_reason: why });
        toast(on ? "Groupe suspendu" : "Groupe réactivé", "ok"); route();
      } else if (a === "reload") { location.reload();
      } else if (a === "sent") { return;
      } else if (a === "wiz-next" || a === "wiz-back") {
        wizardRead();
        if (a === "wiz-back") { W.step = Math.max(0, W.step - 1); viewCreate(); return; }
        var werr = wizardCheck(); if (werr) { msg("w-msg", werr); return; }
        W.step += 1; viewCreate(); window.scrollTo(0, 0);
      } else if (a === "wiz-create") {
        wizardRead();
        var cerr = wizardCheck(); if (cerr) { msg("w-msg", cerr); return; }
        lockBtn(el, true, "Création…");
        var ngid = await rpc("create_group", { p_type: W.type, p_name: W.name, p_amount: W.amount ? Math.round(Number(W.amount)) : null, p_period: W.period, p_wave: W.wave ? digits(W.wave) : null });
        if (W.om) await rpc("update_group", { p_group: ngid, p_name: W.name, p_amount: W.amount ? Math.round(Number(W.amount)) : null, p_period: W.period, p_wave: W.wave ? digits(W.wave) : null, p_om: digits(W.om), p_phones_visible: true });
        W = null; S.g = null;
        toast("Espace créé ! Ajoute maintenant le bureau et les membres.", "ok");
        location.hash = "#/g/" + ngid + "/lancement";
      } else if (a === "inv-accept") {
        lockBtn(el, true); await acceptInvite();
      } else if (a === "launch") {
        if (!confirm("Lancer le groupe maintenant ? L'essai gratuit commence aujourd'hui.")) return;
        lockBtn(el, true, "Lancement…");
        await rpc("launch_group", { p_group: S.g.id });
        toast("Groupe lancé ! Envoie maintenant les invitations.", "ok");
        var lgid = S.g.id; S.g = null; location.hash = "#/g/" + lgid + "/membres";
      } else if (a === "invite") {
        lockBtn(el, true, "…");
        var rows = await rpc("group_members", { p_group: S.g.id });
        var mm = rows.find(function (x) { return x.member_id === el.dataset.member; });
        var tok = await rpc("create_invitation", { p_member: el.dataset.member });
        lockBtn(el, false);
        openSheet("<h3>Invitation de " + esc(mm.first_name) + "</h3><p class=\"small muted\" style=\"margin:0\">Le lien est personnel et valable 7 jours. Un nouvel envoi annule l'ancien lien.</p>" + shareItem({ name: mm.first_name + " " + mm.last_name, phone: mm.phone, text: inviteText(S.g, mm, tok) }));
        S.g._t = 0;
      } else if (a === "invite-all") {
        lockBtn(el, true, "Préparation des liens…");
        var all = await rpc("group_members", { p_group: S.g.id });
        var todo = all.filter(function (m) { return m.status === "actif" && !m.linked && m.phone && m.invite_status !== "envoyee"; });
        var items = [];
        for (var k = 0; k < todo.length; k++) {
          var t2 = await rpc("create_invitation", { p_member: todo[k].member_id });
          items.push({ name: todo[k].first_name + " " + todo[k].last_name, phone: todo[k].phone, text: inviteText(S.g, todo[k], t2) });
        }
        lockBtn(el, false);
        openSheet("<h3>Envoie chaque invitation (" + items.length + ")</h3><p class=\"small muted\" style=\"margin:0\">Touche « WhatsApp » pour chaque membre : la conversation s'ouvre avec son message prêt.</p><div class=\"list\" style=\"max-height:55vh;overflow:auto\">" + items.map(shareItem).join("") + "</div>");
        S.g._t = 0;
      } else if (a === "edit-member") {
        openSheet('<form id="f-edit" class="stack" data-member="' + esc(el.dataset.member) + '" novalidate><h3>Corriger la fiche</h3>' +
          '<div class="field"><label for="e-first">Prénom</label><input id="e-first" type="text" maxlength="60" value="' + esc(el.dataset.first) + '"></div>' +
          '<div class="field"><label for="e-last">Nom</label><input id="e-last" type="text" maxlength="60" value="' + esc(el.dataset.last) + '"></div>' +
          '<div class="field"><label for="e-phone">Numéro</label><input id="e-phone" type="tel" inputmode="numeric" value="' + esc(el.dataset.phone ? showPhone(el.dataset.phone) : "") + '"><small>Changer le numéro annule l\'invitation en cours.</small></div>' +
          '<div id="e-msg"></div><button class="btn btn-green" type="submit">Enregistrer</button></form>');
      } else if (a === "reset-link") {
        if (!confirm("Créer un lien pour que " + el.dataset.name + " choisisse un nouveau mot de passe ?")) return;
        var rt = await rpc("create_reset_link", { p_member: el.dataset.member });
        openSheet("<h3>Lien mot de passe (24 h)</h3><p class=\"small muted\" style=\"margin:0\">Envoie-le uniquement à " + esc(el.dataset.name) + ". Ses connexions en cours seront fermées.</p>" + shareItem({ name: el.dataset.name, phone: el.dataset.phone, text: "Bonjour " + el.dataset.name + ", voici ton lien pour choisir un nouveau mot de passe Mbootaay (valable 24 h, ne le transfère pas) : " + baseUrl() + "#/reinitialiser/" + rt }));
      } else if (a === "code") {
        el.disabled = true;
        await rpc("set_join_code", { p_group: S.g.id, p_enabled: el.dataset.on === "1", p_regenerate: el.dataset.new === "1" });
        toast(el.dataset.new === "1" ? "Nouveau code créé : l'ancien ne marche plus" : el.dataset.on === "1" ? "Code activé" : "Code désactivé", "ok"); refreshGroup();
      } else if (a === "add-list-confirm") {
        lockBtn(el, true, "Ajout…");
        var n = await rpc("add_members", { p_group: S.g.id, p_members: S.pendingList });
        S.pendingList = null; closeSheet(); toast(n + " membres ajoutés", "ok"); refreshGroup();
      }
    } catch (err) { lockBtn(el, false); el.disabled = false; toast(errText(err), "err"); if (a === "wiz-create") msg("w-msg", errText(err)); }
  });

  document.addEventListener("change", async function (e) {
    var el = e.target;
    if (el.type === "file") {
      var drop = document.querySelector('label[for="' + el.id + '"]');
      pickedFile = el.files && el.files[0] || null;
      if (!drop) return;
      if (!pickedFile) { drop.classList.remove("has"); return; }
      if (pickedFile.size > 15 * 1024 * 1024) { toast("Fichier trop lourd", "err"); pickedFile = null; el.value = ""; return; }
      drop.classList.add("has");
      if (/^image\//.test(pickedFile.type)) {
        var url = URL.createObjectURL(pickedFile);
        drop.innerHTML = '<img alt="Aperçu de la capture"><span class="small">Touchez pour changer</span>';
        drop.querySelector("img").src = url;
      } else drop.innerHTML = "<b>📄 " + esc(pickedFile.name) + '</b><span class="small">Touchez pour changer</span>';
      return;
    }
    if (el.dataset.act === "role") {
      var role = el.value;
      if (role === "proprietaire" && !confirm("Donner la propriété du groupe à ce membre ? Tu deviendras président(e).")) { refreshGroup(); return; }
      try { await rpc("set_member_role", { p_member: el.dataset.member, p_role: role }); toast("Rôle mis à jour", "ok"); }
      catch (err) { toast(errText(err), "err"); }
      refreshGroup();
    } else if (el.dataset.act === "cg-filter") {
      sessionStorage.setItem("mb_cg_filter", el.value); route();
    }
  });

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { var m = document.querySelector(".modal"); if (m) m.remove(); } });

  /* ---------------- Démarrage ---------------- */
  window.addEventListener("hashchange", function () { pickedFile = null; route(); });
  sb.auth.onAuthStateChange(function (ev) {
    if (ev === "SIGNED_OUT") { S.session = null; S.me = null; S.owner = false; S.g = null; }
  });
  (async function start() {
    await Promise.all([loadMe(), loadPlans()]);
    await loadSettings();
    route();
  })();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* rien */ }); });
  }
})();
