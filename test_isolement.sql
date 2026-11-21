-- =====================================================================
-- MBOOTAAY — tests d'isolement et de droits
-- Personnes : AWA (crée G1), BOB (membre de G1), CHEIKH (crée G2), JULIEN (propriétaire plateforme)
-- Chaque test qui échoue arrête le script avec « ÉCHEC ».
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, raw_user_meta_data) values
 ('a0000000-0000-0000-0000-00000000000a', '{"first_name":"Awa","last_name":"Diop","phone":"77 111 11 11"}'),
 ('b0000000-0000-0000-0000-00000000000b', '{"first_name":"Bob","last_name":"Fall","phone":"+221781111112"}'),
 ('c0000000-0000-0000-0000-00000000000c', '{"first_name":"Cheikh","last_name":"Sarr","phone":"221761111113"}'),
 ('d0000000-0000-0000-0000-00000000000d', '{"first_name":"Julien","last_name":"Lukos","phone":"701111114"}');
update public.profiles set is_platform_owner = true where id = 'd0000000-0000-0000-0000-00000000000d';

-- un téléphone invalide est refusé à l'inscription
do $$ declare ok boolean := false; begin
  begin insert into auth.users (raw_user_meta_data) values ('{"first_name":"X","last_name":"Y","phone":"12345"}'); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : téléphone invalide accepté';
end $$;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
$$;
create temp table ids (k text primary key, v text);
grant all on ids to authenticated;

-- ---------- AWA crée G1, CHEIKH crée G2 ----------
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into ids select 'g1', public.create_group('tontine', 'Tontine Keur Yaay', 10000, 'mensuelle', '77 000 00 01')::text;
reset role;
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c'); set role authenticated;
insert into ids select 'g2', public.create_group('dahira', 'Dahira Al Baraka', 2000, 'mensuelle', null)::text;
-- CHEIKH ne voit pas G1
do $$ begin assert (select count(*) from public.groups) = 1, 'ÉCHEC : Cheikh voit plus que son groupe'; end $$;
do $$ begin assert (select count(*) from public.groups where id = (select v::uuid from ids where k = 'g1')) = 0, 'ÉCHEC : Cheikh voit G1'; end $$;
reset role;

-- ---------- BOB rejoint G1 avec le code ----------
insert into ids select 'code1', invite_code from public.groups where id = (select v::uuid from ids where k = 'g1');
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b'); set role authenticated;
select public.join_group((select v from ids where k = 'code1'));
-- en attente : il ne voit pas encore la caisse ni le groupe
do $$ begin assert (select count(*) from public.groups) = 0, 'ÉCHEC : membre en attente voit le groupe'; end $$;
-- il ne peut pas s'accepter lui-même
do $$ declare ok boolean := false; begin
  begin perform public.review_member((select v::uuid from ids where k = 'g1'), 'b0000000-0000-0000-0000-00000000000b', 'accepter'); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : un membre en attente a pu s''accepter';
end $$;
-- écriture directe interdite
do $$ declare ok boolean := false; begin
  begin update public.memberships set status = 'actif' where user_id = auth.uid(); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : écriture directe sur memberships possible';
end $$;
reset role;

-- AWA accepte BOB
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a'); set role authenticated;
select public.review_member((select v::uuid from ids where k = 'g1'), 'b0000000-0000-0000-0000-00000000000b', 'accepter');
select public.add_ledger_entry((select v::uuid from ids where k = 'g1'), 'solde_initial', 500000, null, null, 'Solde de départ', null);
reset role;

-- ---------- BOB, membre actif ----------
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$ begin assert (select count(*) from public.groups) = 1, 'ÉCHEC : Bob ne voit pas G1'; end $$;
do $$ begin assert (select count(*) from public.ledger_entries) = 1, 'ÉCHEC : Bob ne voit pas la caisse'; end $$;
-- il ne voit que son propre profil en lecture directe
do $$ begin assert (select count(*) from public.profiles) = 1, 'ÉCHEC : Bob lit les profils des autres'; end $$;
-- il voit la liste des membres via la fonction, avec téléphones (réglage par défaut)
do $$ begin assert (select count(*) from public.group_members((select v::uuid from ids where k = 'g1'))) = 2, 'ÉCHEC : liste des membres'; end $$;
-- il ne peut pas écrire dans la caisse
do $$ declare ok boolean := false; begin
  begin perform public.add_ledger_entry((select v::uuid from ids where k = 'g1'), 'entree', 999, null, null, 'Triche', null); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : un simple membre écrit dans la caisse';
end $$;
do $$ declare ok boolean := false; begin
  begin insert into public.ledger_entries (group_id, kind, sign, amount, label, created_by) values ((select v::uuid from ids where k = 'g1'), 'entree', 1, 5, 'x', auth.uid()); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : insertion directe dans la caisse possible';
end $$;
-- il ne peut pas changer les rôles ni le numéro Wave
do $$ declare ok boolean := false; begin
  begin perform public.set_member_role((select v::uuid from ids where k = 'g1'), 'b0000000-0000-0000-0000-00000000000b', 'tresorier'); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : un membre se donne un rôle';
end $$;
do $$ declare ok boolean := false; begin
  begin perform public.update_group((select v::uuid from ids where k = 'g1'), 'Pirate', 1000, 'mensuelle', '770000099', null, true); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : un membre change le numéro Wave';
end $$;
-- il envoie sa preuve (chemin imposé : groupe/membre/fichier)
do $$ declare ok boolean := false; begin
  begin perform public.submit_proof((select v::uuid from ids where k = 'g1'), 10000, 'wave', '2026-11', 'autre-groupe/b0000000-0000-0000-0000-00000000000b/x.jpg'); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : chemin de capture d''un autre groupe accepté';
end $$;
insert into ids select 'proof1', public.submit_proof((select v::uuid from ids where k = 'g1'), 10000, 'wave', '2026-11',
  (select v from ids where k = 'g1') || '/b0000000-0000-0000-0000-00000000000b/capture.jpg')::text;
-- il ne peut pas valider sa propre preuve
do $$ declare ok boolean := false; begin
  begin perform public.review_proof((select v::uuid from ids where k = 'proof1'), 'valider', null); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : un membre valide sa propre preuve';
end $$;
-- il ne voit pas le journal du bureau
do $$ begin assert (select count(*) from public.audit_log) = 0, 'ÉCHEC : un simple membre lit le journal'; end $$;
reset role;

-- ---------- CHEIKH tente d'agir sur G1 ----------
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c'); set role authenticated;
do $$ begin assert (select count(*) from public.ledger_entries) = 0, 'ÉCHEC : Cheikh voit la caisse de G1'; end $$;
do $$ begin assert (select count(*) from public.payment_proofs) = 0, 'ÉCHEC : Cheikh voit les preuves de G1'; end $$;
do $$ declare ok boolean := false; begin
  begin perform public.review_proof((select v::uuid from ids where k = 'proof1'), 'valider', null); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : Cheikh valide une preuve de G1';
end $$;
do $$ declare ok boolean := false; begin
  begin perform public.group_members((select v::uuid from ids where k = 'g1')); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : Cheikh lit les membres de G1';
end $$;
do $$ declare ok boolean := false; begin
  begin perform public.owner_dashboard(); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : Cheikh ouvre la console du propriétaire';
end $$;
do $$ declare ok boolean := false; begin
  begin perform public.owner_save_plan('petit', 'Petit groupe', 30, 0, 0, 1, true); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : Cheikh change les prix';
end $$;
-- stockage : il ne peut pas déposer dans le dossier de G1
do $$ declare ok boolean := false; begin
  begin insert into storage.objects (bucket_id, name) values ('mb-preuves', (select v from ids where k = 'g1') || '/c0000000-0000-0000-0000-00000000000c/x.jpg'); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : Cheikh dépose un fichier dans G1';
end $$;
reset role;

-- ---------- AWA valide, annule, rien ne s'efface ----------
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a'); set role authenticated;
select public.review_proof((select v::uuid from ids where k = 'proof1'), 'valider', null);
do $$ begin assert (select sum(sign * amount) from public.ledger_entries) = 510000, 'ÉCHEC : solde après cotisation'; end $$;
do $$ declare ok boolean := false; begin
  begin perform public.review_proof((select v::uuid from ids where k = 'proof1'), 'valider', null); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : une preuve validée deux fois';
end $$;
insert into ids select 'sortie', public.add_ledger_entry((select v::uuid from ids where k = 'g1'), 'sortie', 20000, null, null, 'Achat de chaises', null)::text;
select public.reverse_ledger_entry((select v::bigint from ids where k = 'sortie'), 'Erreur de saisie');
do $$ begin assert (select sum(sign * amount) from public.ledger_entries) = 510000, 'ÉCHEC : solde après annulation'; end $$;
do $$ begin assert (select count(*) from public.ledger_entries) = 4, 'ÉCHEC : l''annulation doit garder l''historique'; end $$;
do $$ declare ok boolean := false; begin
  begin perform public.reverse_ledger_entry((select v::bigint from ids where k = 'sortie'), 'Encore'); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : une opération annulée deux fois';
end $$;
-- changement du numéro Wave : annonce automatique à tous
select public.update_group((select v::uuid from ids where k = 'g1'), 'Tontine Keur Yaay', 10000, 'mensuelle', '77 000 00 02', null, false);
do $$ begin assert (select count(*) from public.announcements where is_system) = 1, 'ÉCHEC : pas d''alerte au changement de numéro'; end $$;
do $$ begin assert (select count(*) from public.audit_log) >= 6, 'ÉCHEC : journal incomplet'; end $$;
-- Awa nomme Bob trésorier
select public.set_member_role((select v::uuid from ids where k = 'g1'), 'b0000000-0000-0000-0000-00000000000b', 'tresorier');
reset role;

-- même le compte technique ne peut pas modifier ou effacer une opération directement
do $$ declare ok boolean := false; begin
  begin update public.ledger_entries set amount = 1; exception when others then ok := true; end;
  assert ok, 'ÉCHEC : modification d''une opération possible';
end $$;
do $$ declare ok boolean := false; begin
  begin delete from public.ledger_entries; exception when others then ok := true; end;
  assert ok, 'ÉCHEC : suppression d''une opération possible';
end $$;

-- ---------- BOB trésorier, téléphones masqués ----------
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b'); set role authenticated;
do $$ begin assert (select count(*) from public.payment_proofs) = 1, 'ÉCHEC : le trésorier ne voit pas les preuves'; end $$;
do $$ begin assert (select count(*) from public.audit_log) >= 1, 'ÉCHEC : le trésorier ne voit pas le journal'; end $$;
reset role;

-- un simple membre ne voit plus les téléphones des autres quand le groupe les masque
insert into auth.users (id, raw_user_meta_data) values ('e0000000-0000-0000-0000-00000000000e', '{"first_name":"Eva","last_name":"Ba","phone":"751111115"}');
select pg_temp.as_user('e0000000-0000-0000-0000-00000000000e'); set role authenticated;
select public.join_group((select v from ids where k = 'code1'));
reset role;
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a'); set role authenticated;
select public.review_member((select v::uuid from ids where k = 'g1'), 'e0000000-0000-0000-0000-00000000000e', 'accepter');
reset role;
select pg_temp.as_user('e0000000-0000-0000-0000-00000000000e'); set role authenticated;
do $$ begin assert (select count(*) from public.group_members((select v::uuid from ids where k = 'g1')) where phone is not null) = 1, 'ÉCHEC : téléphones visibles alors que masqués'; end $$;
reset role;

-- ---------- JULIEN : console propriétaire ----------
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d'); set role authenticated;
do $$ begin assert (public.owner_dashboard()->>'groups')::int = 2, 'ÉCHEC : tableau de bord propriétaire'; end $$;
select public.owner_save_plan('petit', 'Petit groupe', 30, 3000, 30000, 1, true);
do $$ begin assert (select price_month from public.plans where id = 'petit') = 3000, 'ÉCHEC : changement de prix'; end $$;
reset role;

-- ---------- Fin d'essai : lecture seule ----------
update public.groups set trial_ends_at = now() - interval '1 day' where id = (select v::uuid from ids where k = 'g1');
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a'); set role authenticated;
do $$ begin assert public.mb_group_state((select v::uuid from ids where k = 'g1')) = 'lecture_seule', 'ÉCHEC : état lecture seule'; end $$;
do $$ declare ok boolean := false; begin
  begin perform public.add_ledger_entry((select v::uuid from ids where k = 'g1'), 'entree', 100, null, null, 'Test', null); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : écriture possible en lecture seule';
end $$;
do $$ begin assert (select count(*) from public.ledger_entries) = 4, 'ÉCHEC : les données doivent rester lisibles en lecture seule'; end $$;
-- le bureau envoie l'abonnement, Julien valide : le groupe redevient actif
insert into ids select 'sub', public.submit_subscription((select v::uuid from ids where k = 'g1'), 'petit', 12, null)::text;
reset role;
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d'); set role authenticated;
select public.owner_review_subscription((select v::uuid from ids where k = 'sub'), 'valider', null);
do $$ begin assert public.mb_group_state((select v::uuid from ids where k = 'g1')) = 'actif', 'ÉCHEC : abonnement non activé'; end $$;
reset role;

-- ---------- anonyme : seulement les tarifs ----------
select set_config('request.jwt.claims', '', false); set role anon;
do $$ begin assert (select count(*) from public.plans) = 3, 'ÉCHEC : tarifs invisibles au public'; end $$;
do $$ declare ok boolean := false; begin
  begin perform count(*) from public.groups; exception when others then ok := true; end;
  assert ok, 'ÉCHEC : un visiteur lit les groupes';
end $$;
do $$ declare ok boolean := false; begin
  begin perform public.create_group('tontine', 'Anonyme', 100, 'mensuelle', null); exception when others then ok := true; end;
  assert ok, 'ÉCHEC : un visiteur crée un groupe';
end $$;
reset role;

\echo '✅ TOUS LES TESTS SONT PASSÉS'
