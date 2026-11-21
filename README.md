# Mbootaay

Plateforme de gestion des groupes : tontines, amicales, dahiras, chorales, associations, GIE et groupements de femmes.
Conçue et développée par **Julien D Y LUKOS**.

## Contenu du dépôt

| Dossier | Contenu |
| --- | --- |
| `sql/` | Scripts de la base de données Supabase, numérotés et appliqués dans l'ordre. Ne jamais modifier un script déjà appliqué : on ajoute un nouveau script. |
| `tests/` | Tests de sécurité (isolement entre groupes, droits des rôles, caisse ineffaçable). |

## Base de données (`sql/001_fondations.sql`)

- Profils créés automatiquement à l'inscription (prénom, nom, numéro sénégalais).
- Groupes de 8 types, code d'invitation, essai gratuit (durée réglable, 15 jours par défaut).
- Rôles : propriétaire, président, trésorier, secrétaire, membre.
- Caisse ineffaçable : une opération ne se modifie ni ne se supprime ; une erreur se corrige par une annulation visible.
- Preuves de paiement Wave / Orange Money validées par le trésorier.
- Alerte automatique à tous les membres si le numéro de paiement du groupe change.
- Journal de toutes les actions.
- Abonnements des groupes et tarifs modifiables par le propriétaire de la plateforme.
- Stockage privé des captures (`mb-preuves`), chemin imposé `<groupe>/<membre>/<fichier>`.

Toutes les écritures passent par des fonctions contrôlées ; les tables ne sont lisibles qu'à travers les règles RLS.

## Lancer les tests en local (PostgreSQL 15+)

```bash
createdb mbootaay_test
psql -d mbootaay_test -f tests/stub_supabase.sql
psql -d mbootaay_test -f sql/001_fondations.sql
psql -d mbootaay_test -f tests/test_isolement.sql
```

Résultat attendu : `✅ TOUS LES TESTS SONT PASSÉS`. Tout test qui échoue s'arrête avec un message « ÉCHEC : … ».

## Sécurité

- Ne jamais déposer de mot de passe, de clé secrète (`service_role`) ou de fichier `.env` dans ce dépôt.
- La clé publique (« publishable ») de Supabase peut figurer dans l'application : elle ne donne accès qu'à ce que les règles RLS autorisent.
