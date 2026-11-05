# Ramadan Basket Manager

Application web de gestion des paniers alimentaires du Ramadan : familles, parrains, vendeurs, distributions, statistiques, qualité des données, import/export Excel et sauvegardes automatiques.

- Next.js 14 (Pages Router), React 18, Tailwind CSS, lucide-react
- MySQL (Aiven) via `mysql2`
- Stockage objet compatible S3 (sauvegardes)
- Déploiement : Vercel + Aiven + stockage S3 + tâche cron externe configurée par vos soins
- Interface en français, fuseau Africa/Casablanca

## 1. Prérequis

- Node.js 20 ou supérieur
- Une base MySQL (Aiven recommandé)
- Un bucket S3 privé (AWS S3, Cloudflare R2, Backblaze B2, MinIO, etc.)
- Un service de cron externe (cron-job.org, GitHub Actions, EasyCron…)

## 2. Installation locale (PowerShell)

```powershell
Expand-Archive .\ramadanBasketManager.zip -DestinationPath .
cd .\ramadanBasketManager
npm install
Copy-Item .env.example .env
```

Renseignez ensuite `.env` (voir section 3).

```powershell
npm run db:init
npm run admin:create
npm run dev
```

Pour voir l'application remplie de données de démonstration (50 familles, 22 profils de parrainage couvrant les quatre structures : 2 super-parrains, 2 parrains spéciaux avec 4 sous-parrains et 14 parrains classiques, 10 vendeurs, 10 utilisateurs non administrateurs et 5 distributions passées pour les statistiques) :

```powershell
npm run data:init
```

Le script affiche un mot de passe aléatoire commun aux utilisateurs de démonstration. Il refuse de s'exécuter si des données existent déjà ; pour repartir de zéro : `npm run data:init -- --force` (supprime familles, parrains, vendeurs, distributions et utilisateurs non administrateurs). Ne l'utilisez pas en production.

Important : le schéma a changé par rapport à la version précédente (champs supprimés, un seul panier par famille). Si vous avez déjà une base créée avec l'ancienne version, recréez-la (`DROP DATABASE` puis `CREATE DATABASE`) avant `npm run db:init`. Si votre base vient de la version avec super-parrains (colonne `is_group`), il suffit de relancer `npm run db:init` : une migration ajoute la colonne `type` (les super-parrains sont conservés, les autres deviennent parrains classiques) et supprime `is_group`. Vérifiez ensuite l'arborescence : les anciens parrains rattachés à un super-parrain deviennent des parrains classiques, à passer en sous-parrains si nécessaire.

L'application est disponible sur http://localhost:3000.

## 3. Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Connexion MySQL |
| `DB_SSL` | `true` pour Aiven (TLS obligatoire) |
| `DB_SSL_CA` | Certificat CA Aiven (contenu PEM complet, optionnel mais recommandé) |
| `DB_POOL_SIZE` | Taille du pool (4 par défaut) |
| `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS` | Cookie de session et durée |
| `BACKUP_API_SECRET` | Secret Bearer de l'endpoint de sauvegarde (long et aléatoire) |
| `BACKUP_STORAGE_ENDPOINT` | URL du service S3 |
| `BACKUP_STORAGE_BUCKET` | Bucket privé |
| `BACKUP_STORAGE_REGION` | Région (`auto` pour R2) |
| `BACKUP_STORAGE_ACCESS_KEY_ID`, `BACKUP_STORAGE_SECRET_ACCESS_KEY` | Identifiants S3 |
| `BACKUP_STORAGE_FORCE_PATH_STYLE` | `true` pour MinIO / certains services |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Utilisés uniquement par `npm run admin:create` (le nom d'utilisateur sert d'identifiant de connexion) |

Générer un secret de sauvegarde :

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Aucun secret n'est stocké dans le code. Ne committez jamais `.env`.

## 4. Base de données Aiven

1. Créez un service MySQL sur Aiven et récupérez hôte, port, utilisateur, mot de passe.
2. Téléchargez le certificat CA et collez son contenu dans `DB_SSL_CA` (retours à la ligne conservés, ou `\n`).
3. Dans `.env`, mettez `DB_SSL=true`.
4. Initialisez le schéma : `npm run db:init` (idempotent, utilise `CREATE TABLE IF NOT EXISTS`).
5. Créez le premier administrateur :

```powershell
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="UnMotDePasseLongEtUnique"
npm run admin:create
```

Le script refuse de s'exécuter s'il existe déjà un administrateur actif, sauf avec `ADMIN_FORCE=true`.

## 5. Rôles

- **Utilisateur** : familles, parrains, vendeurs, distributions, statistiques, qualité des données, exports. L'identifiant de connexion est le nom de l'utilisateur.
- **Administrateur** : tout ce qui précède, plus gestion des utilisateurs, import Excel avancé, réinitialisation des données et sauvegardes.

Le dernier administrateur actif ne peut être ni désactivé, ni rétrogradé, ni supprimé.

## 6. Tests, lint et build

Les tests lisent les variables `TEST_DB_*` (à défaut `DB_*`) et utilisent une base dédiée dont le nom doit se terminer par `_test` ; ils refusent de tourner sinon, afin de ne jamais toucher aux données réelles.

```powershell
$env:TEST_DB_HOST="127.0.0.1"
$env:TEST_DB_USER="root"
$env:TEST_DB_PASSWORD="votreMotDePasse"
$env:TEST_DB_NAME="rbm_test"
npm test
npm run lint
npm run build
```

La base `rbm_test` doit exister (`CREATE DATABASE rbm_test CHARACTER SET utf8mb4;`). Le schéma y est appliqué par les tests.

## 7. Déploiement sur Vercel

1. Poussez le projet sur un dépôt Git et importez-le dans Vercel (framework : Next.js).
2. Ajoutez toutes les variables de la section 3 (sauf `ADMIN_*`) dans Settings > Environment Variables.
3. Déployez.
4. Exécutez `npm run db:init` et `npm run admin:create` depuis votre poste avec les variables Aiven.

Notes :

- L'import Excel et la sauvegarde déclarent `maxDuration = 60` s. Cette valeur est plafonnée par votre plan Vercel ; sur le plan gratuit, une grosse base peut dépasser la limite.
- Aucun cron Vercel n'est configuré : la planification est externe.

## 8. Sauvegardes

Chaque exécution produit deux fichiers dans le bucket privé :

- `ramadan-backups/AAAA-MM-JJ/<id>-database.sql.gz` : dump SQL complet compressé (schéma des données, comptes utilisateurs avec hachages, historique). Les sessions et limites de débit ne sont pas incluses.
- `ramadan-backups/AAAA-MM-JJ/<id>-snapshot.xlsx` : instantané Excel lisible (familles, parrains, vendeurs, distributions). Il ne contient aucun secret.

Distinction importante :

- **Le SQL est la sauvegarde de restauration.**
- **L'Excel est un export de consultation, pas une sauvegarde complète de la base.**
- Les sauvegardes natives Aiven restent une couche indépendante et complémentaire ; activez-les.

### Cron externe

Appel quotidien recommandé à 03:00 heure du Maroc (Africa/Casablanca). Vérifiez le fuseau de votre service de cron.

```powershell
curl.exe -X POST "https://votre-domaine.vercel.app/api/backups/create" -H "Authorization: Bearer VOTRE_SECRET"
```

Configuration côté service de cron : méthode `POST`, en-tête `Authorization: Bearer <BACKUP_API_SECRET>`, expiration d'au moins 60 s.

Codes de réponse :

| Code | Signification |
| --- | --- |
| 200 | Sauvegarde réussie, ou déjà réalisée pour la date (`already_completed`) |
| 401 | Secret absent ou invalide |
| 405 | Méthode autre que POST |
| 409 | Une sauvegarde est déjà en cours |
| 429 | Trop de tentatives invalides |
| 500 | Échec ou sauvegarde partielle (voir le détail dans la page Sauvegardes) |

L'appel est idempotent par date : relancer le cron ne crée pas de doublon. Une exécution restée « en cours » plus de 15 minutes est considérée comme échouée et peut être relancée.

### Vérification et diagnostic

- Page **Sauvegardes** (administrateur) : historique, statut, taille, erreurs, téléchargements.
- Les téléchargements utilisent des liens signés valables 60 secondes.
- En cas d'échec : lisez le message d'erreur de l'exécution, vérifiez les variables `BACKUP_STORAGE_*`, les droits du jeton S3 (écriture, lecture, HEAD, upload multipart) et la limite de durée Vercel.
- Un bouton permet de lancer manuellement une sauvegarde depuis l'interface.

### Restauration SQL

```powershell
$env:MYSQL_PWD="motDePasse"
$dump = ".\database.sql.gz"
$sql = ".\database.sql"
python -c "import gzip,shutil;shutil.copyfileobj(gzip.open(r'$dump','rb'),open(r'$sql','wb'))"
mysql --host HOTE --port PORT --user UTILISATEUR --ssl-mode=REQUIRED NOM_BASE -e "source $sql"
```

Sous Linux/macOS : `gunzip -c database.sql.gz | mysql -h HOTE -P PORT -u UTILISATEUR -p NOM_BASE`.

Restaurez de préférence dans une base vide.

## 9. Fonctionnalités et règles

- Parrainage hiérarchique, quatre types de profil :
  - **Super-parrain** : gère plusieurs parrains classiques ou spéciaux. Jamais de familles directes.
  - **Parrain classique** : gère directement ses familles. Pas de sous-parrains. Indépendant ou rattaché à un super-parrain.
  - **Parrain spécial** : gère plusieurs sous-parrains. Jamais de familles directes. Indépendant ou rattaché à un super-parrain.
  - **Sous-parrain** : toujours rattaché à un parrain spécial. Gère directement ses familles.
  Structures possibles : super-parrain avec parrains classiques, super-parrain avec parrain spécial (donc sous-parrains), parrain classique indépendant, parrain spécial indépendant.
- Ces règles sont appliquées par le serveur (création, modification, import Excel, création et déplacement de familles), pas seulement par l'interface. Un changement de type est refusé s'il laisserait des familles ou des rattachements invalides (par exemple un classique qui a des familles ne peut pas devenir spécial). Le rattachement est vérifié dans une transaction avec verrou de ligne.
- La page Parrains propose une liste (avec filtre par type) et une arborescence dépliable jusqu'aux familles. Chaque profil rattaché porte un badge « Sous [parrain] » dans toutes les listes.
- Filtrer par un super-parrain ou un parrain spécial inclut les familles de tous ses descendants. Les totaux d'un parent sont la somme de ses enfants, sans double comptage.
- Statistiques : tableau « Familles et bénéficiaires par parrain » (familles, ont bénéficié, en attente, couverture) avec, pour chaque super-parrain ou parrain spécial, le détail de chaque rattaché puis son total, et un total général.
- Recherche intelligente des familles, parrains et vendeurs : insensible à la casse et aux accents, translittération arabe/latin, tolérance aux fautes (« Moahmd » trouve « Mohamed », « بوقنيطير » trouve « Bouknitir », « Lobna » trouve « Loubna »), recherche par CIN ou téléphone. Les familles sont aussi trouvées par le nom de leurs membres.
- Création d'une famille : CIN du responsable et parrain obligatoires. Le choix du parrain est une recherche ; un bouton ouvre une fenêtre pour créer un parrain (nom, CIN, téléphone). Si le nom saisi ressemble à un parrain existant, « Voulez-vous dire X ? » permet de le sélectionner directement ; sinon le nouveau parrain est créé et sélectionné automatiquement. Même principe pour les vendeurs.
- Téléphones contrôlés : 10 chiffres commençant par 05, 06 ou 07 (ou +212). Le téléphone d'un membre reprend par défaut celui du responsable.
- Liste des familles : onglets séparés « En attente » et « Déjà bénéficiaires », chaque ligne est entièrement cliquable et affiche les membres, filtres parrain et vendeur avec recherche.
- Distributions : trois étapes (familles, vendeurs avec schéma de répartition, confirmation). Plusieurs distributions le même jour sont possibles. Une famille ne reçoit qu'un seul panier : la règle est garantie par la base de données et seules les familles jamais servies sont proposées. Dès qu'une famille est attribuée à un vendeur, elle est considérée comme servie (pas de suivi de retrait). Le vendeur d'une famille peut être modifié ; la suppression d'une distribution (administrateur) rend ses familles de nouveau disponibles.
- Statistiques, qualité des données, import Excel administrateur en plusieurs étapes (CIN et parrain du responsable obligatoires), réinitialisation sécurisée avec journal d'audit.
- Export Excel : le nom du fichier reflète les filtres, par exemple `familles_11102026_bouknitir_beneficie.xlsx`.
- Sécurité : sessions en base, cookie HttpOnly SameSite=Strict, protection CSRF, limitation des tentatives de connexion, requêtes paramétrées, journal d'audit.

## 10. Dépannage

| Problème | Piste |
| --- | --- |
| `ETIMEDOUT` / `ECONNREFUSED` vers Aiven | Vérifiez l'hôte, le port et la liste d'adresses IP autorisées du service |
| Erreur de certificat | Renseignez `DB_SSL_CA` avec le CA Aiven |
| Connexion impossible | Exécutez `npm run admin:create` ; la limitation de débit se libère après quelques minutes |
| `401` sur la sauvegarde | Secret différent entre Vercel et le cron |
| Sauvegarde `partial` | L'un des deux fichiers a échoué ; consultez le message sur la page Sauvegardes |
| Tests refusés | Le nom de la base de test doit finir par `_test` |

## 11. Limites connues et vérifications réellement effectuées

Effectué dans l'environnement de développement :

- 166 tests automatisés passent (normalisation, recherche floue, familles, distributions, un panier par famille, statistiques, sécurité, import/export, noms de fichiers d'export, sauvegardes, hiérarchie des super-parrains) sur MariaDB local.
- Lint sans avertissement et build de production réussi.
- Parcours navigateur réel (Chromium, Playwright) sur des données générées par `npm run data:init` : connexion, tableau de bord, liste des familles et recherche floue, création d'une famille avec création de parrain, suggestion « Voulez-vous dire », plafond de saisie du téléphone, téléphone des membres, conservation du focus dans les fenêtres vendeur/utilisateur/parrain, distribution complète en trois étapes avec schéma, séparation des familles servies, export avec nom de fichier, pages statistiques / qualité / import / sauvegardes, affichage mobile sans défilement horizontal.

Non vérifié :

- Les règles de hiérarchie sont garanties par le code applicatif, pas par des contraintes ou déclencheurs SQL. Une modification directe en SQL sur la base peut les contourner.
- Le projet n'a que deux rôles (utilisateur, administrateur) et aucun compte lié à un parrain : il n'existe donc pas de restriction d'accès aux données par branche de la hiérarchie. Tous les utilisateurs connectés voient tout l'arbre.

- Aiven MySQL réel (TLS, certificat CA), Vercel réel et un vrai fournisseur S3 : les tests utilisent MariaDB local et l'émulateur S3 `s3rver`.
- Le service de cron externe n'est pas configuré par ce projet ; c'est à vous de le créer.
- Les durées maximales Vercel selon votre plan peuvent limiter les très gros imports ou dumps.
- MariaDB (tests) et MySQL (Aiven) sont compatibles pour le schéma utilisé, mais des différences mineures de version restent possibles.
- Les polices (Google Fonts) ne se chargent pas dans l'environnement de test sans accès Internet ; l'interface se replie alors sur la police système.

Politiques :

- Import « remplacer » : remplace familles, membres et parrains ; conserve vendeurs, distributions, attributions et utilisateurs.
- Les attributions conservent un instantané (nom, CIN, téléphone, parrain, vendeur) de sorte que l'historique reste lisible après modification ou suppression.
