# SOFT POWER 2050 — Spécification complète pour Claude Code

> **Comment utiliser ce fichier** : place-le à la racine d'un dossier vide sous le nom `SPEC.md`, lance Claude Code dans ce dossier et écris :
> « Lis SPEC.md en entier. Construis le jeu étape par étape en suivant la section *Plan de travail*. Pose-moi tes questions avant de commencer si quelque chose est ambigu. »

---

## 0. Ta mission (prompt pour Claude Code)

Tu vas développer **Soft Power 2050**, un jeu multijoueur en équipes, au tour par tour, joué en classe sur ordinateurs portables (et téléphones), qui dure environ **30 minutes**. Il clôt un atelier universitaire (Master 128 MBC, Université Paris-Dauphine, cours « Transformations du travail et numérique ») intitulé *« La crise d'un modèle : quels horizons… après l'American Way of Life »*. Juste après le jeu, la classe débat.

Le jeu doit être **fun** (public : des étudiants de master de la même promo), **visuel** (une carte projetée où les couleurs des équipes se propagent), **robuste** (30 personnes connectées en même temps sur le wifi d'une fac) et **simple à lancer** (un QR code, aucun compte).

Respecte strictement : la stack technique (§2), les règles (§4 à §9), les données (§10 à §13) et le plan de travail (§16). Quand un détail n'est pas précisé, choisis la solution la plus simple et note-la dans le README.

---

## 1. L'idée du jeu en une minute

- 2030. Le rêve américain (« l'American Way of Life ») ne fait plus rêver : écologie, consommation, travail, inégalités, tout craque.
- **5 équipes** dirigent chacune un pays : 🇺🇸 USA, 🇫🇷 France, 🇸🇪 Suède, 🇨🇳 Chine, 🇧🇷 Brésil.
- Chaque joueur a un **rôle** (Président·e, Économie & Travail, Écologie, Culture, Voix du peuple, Diplomate).
- **6 tours** (2030 → 2050). À chaque tour : un **événement mondial** tombe, chaque joueur choisit **une carte** parmi 3, l'équipe valide, puis le jeu **révèle** les effets.
- Chaque pays a 4 jauges, qui sont les 4 fractures du cours : 💰 Croissance, 🌍 Planète, 🙂 Bonheur & sens du travail, 🤝 Cohésion sociale.
- Plus un pays est **attractif** et répond aux **besoins** des pays voisins, plus il les influence. Sur la carte, ces pays **prennent sa couleur** : c'est sa **zone d'influence**.
- **Gagne** l'équipe qui a la plus grande zone d'influence en 2050.
- **Twist** : si la somme des jauges 🌍 Planète des 5 pays est trop basse à la fin, **tout le monde perd**.

### Point d'attention majeur sur le ton et le vocabulaire
Le jeu parle de **soft power** (Joseph Nye : faire envie plutôt que contraindre), **pas de colonisation**. Concrètement :
- On ne « conquiert », ne « capture », ne « rallie » et ne « convertit » jamais un pays. Dans tous les textes de l'interface, utilise : **« s'inspire de »**, **« adopte l'idée de »**, **« rejoint la zone d'influence de »**, **« regarde vers »**.
- Un pays non joué n'est jamais passif : il a **son propre besoin** (emplois, énergie, climat…) et s'inspire du modèle qui y répond le mieux.
- Forcer l'influence (pub massive, chantage commercial) fonctionne à court terme mais déclenche un **rejet culturel** qui la fait perdre.
- Aucune caricature de peuples ou de cultures. Les blagues portent sur les situations (l'IA, le burn-out, les canicules, les consultants juniors…), jamais sur les nationalités.

---

## 2. Stack technique (obligatoire)

Reprends exactement l'architecture de deux jeux qui ont déjà fonctionné en classe avec cet utilisateur :

- **Hébergement** : Netlify, déployé automatiquement depuis un dépôt GitHub (l'utilisateur crée lui-même le dépôt et le site Netlify ; tu prépares le code et les commits).
- **Front** : HTML + CSS + JavaScript vanilla, **sans build, sans framework, sans bundler**. Fichiers statiques dans `public/`.
- **Back** : **Netlify Functions v2** (modules ESM `.mjs`, `export default async (req) => Response`, et `export const config = { path: "/api/..." }`).
- **Stockage** : **Netlify Blobs**, `@netlify/blobs` version **11.1.2** épinglée, `getStore({ name: "softpower", consistency: "strong" })`.
- **Temps réel** : **polling** toutes les 1,5 s (pas de WebSocket). Le serveur renvoie `serverNow` pour que le client corrige le décalage d'horloge des timers.
- **Auth hôte** : variable d'environnement Netlify `HOST_KEY` (secrète, définie par l'utilisateur). L'écran hôte la demande une fois et la garde dans `localStorage` (clé `sp_host_key`). Toutes les actions hôte vérifient cette clé. **Ne jamais écrire sa valeur dans le code ni dans le README.**
- **QR code** : `qrcodejs` 1.0.0 depuis cdnjs (`https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js`).
- **Polices** : Google Fonts autorisées (voir §14).
- **Tests** : `node:test` (aucune dépendance de test). Mocke `@netlify/blobs` par un store en mémoire pour tester les fonctions.
- `netlify.toml` :
  ```toml
  [build]
    publish = "public"
    functions = "netlify/functions"
  ```
- `package.json` : `"type": "module"`, dépendance unique `@netlify/blobs: 11.1.2`, scripts `test` et `simulate`.

### Arborescence attendue
```
netlify.toml
package.json
README.md                    (en français : mise en ligne + déroulé le jour J)
netlify/
  lib/
    data.mjs                 (pays, carte, cartes, événements, rôles : DONNÉES PURES)
    engine.mjs               (moteur de règles : FONCTIONS PURES, aucune I/O)
    rng.mjs                  (aléatoire déterministe seedé)
    store.mjs                (accès Blobs + helpers)
    view.mjs                 (construction de l'état public / privé envoyé aux clients)
  functions/
    state.mjs    → GET  /api/state?pid=...
    join.mjs     → POST /api/join
    pick.mjs     → POST /api/pick
    team.mjs     → POST /api/team       (actions Président / Voix du peuple / Diplomate)
    host.mjs     → POST /api/host       (toutes les actions de l'hôte)
public/
  index.html                 (écran joueur)
  host.html                  (écran projeté)
  app.css
  player.js
  host.js
  map.js                     (rendu SVG de la carte, partagé hôte/joueur)
scripts/
  simulate.mjs               (simulation de 1000 parties avec des bots pour équilibrer)
tests/
  engine.test.mjs
  roles.test.mjs
  api.test.mjs
```

### Règle d'or contre les conflits d'écriture
30 joueurs écrivent en même temps : **ne fais jamais écrire deux clients sur la même clé Blobs**.
- `game` : écrit **uniquement** par les actions hôte (et la résolution du tour, déclenchée par l'hôte).
- `players/<pid>` : écrit par le joueur `<pid>` à l'inscription.
- `picks/<gameId>/<turn>/<team>/<role>` : écrit par le joueur qui tient ce rôle.
- `team/<gameId>/<turn>/<team>/president`, `.../voice`, `.../diplomat` : écrits par le joueur concerné.
- `offers/<gameId>/<turn>/<fromTeam>-<toTeam>` : offre d'un diplomate, la réponse va dans `.../reply`.
- La résolution du tour (hôte) **liste** ces clés avec `store.list({ prefix })`, calcule, puis écrit `game`.
- `gameId` change à chaque « Reset » pour repartir de zéro sans devoir effacer les anciennes clés.

---

## 3. Écrans et flux général

Deux URL :
- `/` : **écran joueur** (le QR code y mène).
- `/host.html` : **écran hôte**, projeté au tableau et piloté par l'animateur.

### Machine à états (champ `game.phase`)
```
lobby → roles → [ event → decide → validate → reveal ] × 6 → end
```
| Phase | Durée par défaut | Qui avance | Ce qui se passe |
|---|---|---|---|
| `lobby` | libre | hôte : « Start game » | Les joueurs scannent, entrent un pseudo, choisissent une équipe ou « Auto ». L'écran hôte affiche le QR code, les 5 équipes et les pseudos. |
| `roles` | ~30 s | hôte : « Next » | Les rôles sont attribués et verrouillés (§5). Chaque joueur voit sa **carte de rôle**. L'écran hôte montre la carte de départ et les jauges initiales. |
| `event` | ~30 s | hôte : « Next » | La « une » du journal de l'année s'affiche en plein écran sur l'hôte et en résumé chez les joueurs. |
| `decide` | **150 s** (timer réglable de 60 à 240 s) | timer, ou hôte : « Close now » | Chaque joueur choisit 1 carte parmi 3 pour chacun de ses rôles. Les cartes Culture demandent une cible. Les diplomates envoient et acceptent des offres. |
| `validate` | **30 s** | timer, ou hôte : « Close now » | Le ou la Président·e voit les choix de l'équipe, peut **opposer son veto** à 1 carte et déclencher le **super-pouvoir**. La Voix du peuple peut lancer sa **grève** (1 fois par partie). |
| `reveal` | libre | hôte : « Next turn » | Le serveur résout le tour (§8). L'hôte anime la propagation des couleurs et affiche les gros titres. |
| `end` | — | hôte : « Reset » | Podium, jauge planète, récompenses fun, puis la question du débat. |

Dérive la phase effective côté serveur à partir de `phaseEndsAt` : si `decide` est expirée, `/api/state` renvoie `validate` sans écrire ; si `validate` est expirée, on considère les choix comme verrouillés. **La résolution n'est déclenchée que par l'action hôte `reveal`**, et elle est idempotente : si le tour est déjà résolu, elle ne refait rien.

Raccourcis clavier côté hôte : `→` ou `Espace` = action suivante logique ; `R` (deux fois) = reset.

---

## 4. Les équipes et leurs pays

Valeurs de jauge entières de 0 à 10 (on écrête toujours dans cet intervalle).

| id | Pays | Couleur | 💰 eco | 🌍 planet | 🙂 happy | 🤝 cohesion | Super-pouvoir (1 fois par partie, déclenché par le Président en phase `validate`) |
|---|---|---|---|---|---|---|---|
| `usa` | 🇺🇸 USA | `#E4572E` (rouge-orangé) | 8 | 2 | 5 | 4 | **Hollywood** : +4 d'influence sur **n'importe quel** pays de la carte, même non voisin (le Président choisit la cible). |
| `fra` | 🇫🇷 France | `#2E86DE` (bleu) | 6 | 5 | 7 | 4 | **Art de vivre** : ce tour-ci, l'effet d'influence de la carte Culture de l'équipe est **doublé**. |
| `swe` | 🇸🇪 Suède | `#F4C430` (jaune) | 5 | 6 | 7 | 7 | **Lagom** : le rejet retombe à 0 et 🙂 +1. |
| `chn` | 🇨🇳 Chine | `#C0392B` (rouge profond) | 7 | 3 | 3 | 5 | **Routes de la soie** : +2 d'influence sur **3** pays éligibles au choix, mais rejet +1. |
| `bra` | 🇧🇷 Brésil | `#27AE60` (vert) | 4 | 8 | 6 | 4 | **Carnaval** : +3 d'influence sur tous les pays au besoin `fete` (où qu'ils soient) et +1 sur tous les pays éligibles ; 🙂 +1. |

Ces couleurs doivent rester bien distinctes sur la carte (vérifie le contraste avec le fond, et ajoute aussi un motif ou un drapeau emoji pour ne pas dépendre de la couleur seule). Comme USA et Chine sont tous deux rouges, éloigne-les : USA = orange `#E8743B`, Chine = rouge `#C0392B`.

---

## 5. Les rôles et leur attribution automatique

### Les 6 rôles (par ordre de priorité)
| ordre | id | Rôle | Ce qu'il fait |
|---|---|---|---|
| 1 | `president` | 👑 Président·e | Choisit une carte « Président » ; en phase `validate`, voit les choix de son équipe, peut **opposer son veto à 1 carte** de l'équipe (sauf la grève) et déclenche le **super-pouvoir** (avec ses cibles si besoin). |
| 2 | `eco` | 🏭 Économie & Travail | Choisit une carte Économie (semaine de 4 jours, robots, revenu universel…). |
| 3 | `ecolo` | 🌱 Écologie | Choisit une carte Écologie. |
| 4 | `culture` | 🎬 Culture / Soft Power | Choisit une carte Culture **et une cible** (un pays éligible, ou n'importe lequel si la carte est « mondiale »). |
| 5 | `voice` | 📣 Voix du peuple (syndicat & jeunesse) | Choisit une carte « Revendication » ; peut lancer **la grève**, une fois par partie : elle annule la carte `eco` **ou** `ecolo` de son équipe ce tour-ci (la Voix choisit laquelle), donne 🤝 +1 et 💰 −1. La grève n'est pas soumise au veto. |
| 6 | `diplomat` | 🤝 Diplomate | Voit en direct les jauges, le rejet et la zone d'influence de **toutes** les équipes ; peut envoyer **une offre** par tour à une autre équipe (§9). |

### Inscription
- Le joueur entre un pseudo (2 à 16 caractères, échappé à l'affichage), puis choisit une équipe ou **« Auto »**, qui le place dans l'équipe la moins nombreuse.
- Un identifiant `pid` aléatoire est stocké en `localStorage` (`sp_pid`). Si le joueur recharge la page, il retrouve sa place.
- L'hôte peut, depuis le lobby, **déplacer un joueur** d'une équipe à l'autre et cliquer **« Balance teams »**.
- Une équipe peut être vide : elle est alors **jouée par un bot** (§15), pour garder une carte vivante même s'il y a peu de joueurs.

### Attribution des rôles au passage en phase `roles`
Les rôles dépendent de **n**, le nombre de joueurs de l'équipe. Un joueur peut tenir plusieurs rôles : il verra alors des **onglets** et choisira une carte par rôle.

| n | Répartition |
|---|---|
| 0 | équipe bot |
| 1 | J1 : tous les rôles |
| 2 | J1 : president + culture + diplomat · J2 : eco + ecolo + voice |
| 3 | J1 : president + diplomat · J2 : eco + voice · J3 : ecolo + culture |
| 4 | J1 : president + diplomat · J2 : eco · J3 : ecolo + voice · J4 : culture |
| 5 | J1 : president + diplomat · J2 : eco · J3 : ecolo · J4 : culture · J5 : voice |
| 6 | un rôle chacun |
| 7+ | les 6 rôles sont attribués, puis chaque joueur en plus devient **co-titulaire** d'un rôle, dans l'ordre culture, eco, ecolo, president, voice, diplomat. Les co-titulaires voient la même chose et peuvent tous cliquer : **le dernier choix enregistré compte** (une seule clé par rôle). |

L'ordre des joueurs dans l'équipe suit leur heure d'inscription. **Retardataires** (inscrits après la phase `lobby`) : ils rejoignent l'équipe la moins nombreuse comme co-titulaires selon la même règle. **Ne réattribue jamais** les rôles déjà donnés en cours de partie.
Écris des tests pour n = 0 à 9.

### Choix manquants
Si un rôle n'a rien choisi à la fin de `decide`, **aucune carte** n'est jouée pour ce rôle (et un gros titre fun le signale : « Le ministère de l'Écologie français était en pause café ☕ »). Si le Président n'agit pas en `validate`, il n'y a ni veto ni super-pouvoir.

---

## 6. La carte

### Pays et besoins
28 pays : les 5 pays des équipes et 23 pays non joués. Chaque pays non joué a **un besoin** (`need`) et des coordonnées `x, y` en pourcentage (0 à 100) pour l'affichage.

| id | Pays | need | x | y |
|---|---|---|---|---|
| `can` | Canada | climat | 18 | 14 |
| `usa` | **USA** (équipe) | — | 18 | 28 |
| `mex` | Mexique | ville | 17 | 42 |
| `col` | Colombie | fete | 25 | 52 |
| `bra` | **Brésil** (équipe) | — | 32 | 62 |
| `chl` | Chili | climat | 26 | 78 |
| `arg` | Argentine | egalite | 33 | 82 |
| `gbr` | Royaume-Uni | burnout | 45 | 20 |
| `nor` | Norvège | ville | 51 | 9 |
| `swe` | **Suède** (équipe) | — | 56 | 12 |
| `fin` | Finlande | egalite | 61 | 9 |
| `pol` | Pologne | energie | 59 | 22 |
| `fra` | **France** (équipe) | — | 47 | 30 |
| `deu` | Allemagne | energie | 53 | 26 |
| `esp` | Espagne | fete | 43 | 38 |
| `mar` | Maroc | emploi | 45 | 47 |
| `nga` | Nigeria | energie | 50 | 59 |
| `egy` | Égypte | emploi | 58 | 46 |
| `ken` | Kenya | tech | 61 | 62 |
| `zaf` | Afrique du Sud | egalite | 56 | 80 |
| `tur` | Turquie | emploi | 63 | 34 |
| `ind` | Inde | emploi | 72 | 46 |
| `chn` | **Chine** (équipe) | — | 80 | 32 |
| `kor` | Corée du Sud | burnout | 87 | 27 |
| `jpn` | Japon | burnout | 92 | 33 |
| `vnm` | Vietnam | tech | 82 | 48 |
| `idn` | Indonésie | climat | 85 | 63 |
| `aus` | Australie | climat | 89 | 81 |

### Voisinages (liaisons du plateau ; rends-les symétriques dans le code et teste la symétrie)
```
usa: can, mex, gbr, jpn
can: usa, gbr
mex: usa, col
col: mex, bra, chl
bra: col, arg, chl, nga, zaf
arg: bra, chl, zaf
chl: col, bra, arg, aus
gbr: usa, can, fra, swe, nor
nor: gbr, swe
swe: gbr, nor, fin, pol, deu
fin: swe, pol
pol: swe, fin, deu
fra: gbr, deu, esp, mar
deu: fra, swe, pol, tur
esp: fra, mar
mar: fra, esp, nga, egy
nga: mar, bra, ken, zaf
egy: mar, tur, ken
ken: egy, nga, zaf, ind
zaf: nga, ken, bra, arg
tur: deu, egy, ind
ind: tur, ken, chn, idn
chn: ind, jpn, kor, vnm
jpn: chn, kor, usa
kor: chn, jpn
vnm: chn, idn
idn: ind, vnm, aus
aus: idn, chl
```

### Besoins et jauge correspondante
| need | icône | libellé affiché | jauge regardée |
|---|---|---|---|
| `emploi` | 👷 | Jobs for young people | eco |
| `tech` | 💻 | Tech & innovation | eco |
| `climat` | 🌊 | Climate resilience | planet |
| `energie` | ⚡ | Clean energy | planet |
| `burnout` | 😮‍💨 | Escape burnout | happy |
| `ville` | 🏙️ | Liveable cities | happy |
| `egalite` | ⚖️ | Fairer society | cohesion |
| `fete` | 🎉 | Culture & joy | attractivité globale |

### Rendu visuel (style « jeu de plateau »)
- Un SVG plein écran, `viewBox="0 0 1000 600"`. Chaque pays est une **tuile hexagonale** placée en (x, y), avec son nom et l'icône de son besoin.
- Les voisinages sont des **traits fins** entre les tuiles. Une liaison longue (USA–Japon, Chili–Australie) est dessinée en pointillés courbes, comme une route maritime.
- Les pays d'équipe sont **plus grands**, avec un drapeau emoji et un liseré épais.
- Un pays dans une zone d'influence prend la couleur de l'équipe : **opacité 0,35** si l'influence est faible (score max < 7), **0,9** si elle est forte (≥ 7). Ajoute aussi le drapeau de l'équipe en petit dans la tuile.
- Pendant `reveal`, anime les changements **un pays à la fois**, toutes les 400 ms : une pulsation, puis le fondu vers la nouvelle couleur. En parallèle, le gros titre correspondant défile en bas de l'écran. Respecte `prefers-reduced-motion`.
- Au survol (hôte) ou au toucher (joueur), une info-bulle affiche le besoin du pays et les scores d'influence des équipes.
- Le rendu de la carte (`map.js`) est **partagé** entre l'hôte (grand) et les joueurs (mini-carte, utilisée pour choisir les cibles Culture : les pays éligibles sont surlignés et cliquables).

---

## 7. Les formules (le cœur du moteur)

Tout est dans `engine.mjs`, en **fonctions pures**, avec des tests.

### Attractivité
```
attract(T) = (eco + planet + happy + cohesion) / 4          // de 0 à 10, un décimal
```

### Pays éligibles pour l'équipe T
Un pays non joué N est **éligible** pour T s'il est voisin du pays de T **ou** voisin d'un pays qui est déjà dans la zone d'influence de T. Les effets « mondiaux » ignorent cette règle.

### Gain d'influence passif, à chaque tour, pour chaque N éligible pour T
```
passive   = attract(T) / 5                                   // de 0 à 2
match     = (need == "fete" ? attract(T) : gauge(T, need)) / 5   // de 0 à 2
cardMatch = min(2, nombre de cartes jouées par T ce tour dont tags contient N.need)
gain      = passive + match + cardMatch
si rejection(T) >= 3 : gain = gain × 0,7
gain × eventMultiplier(N)   (par défaut 1 ; voir les événements)
```

### Bonus ciblés
- **Carte Culture** : `+influence` sur la cible (valeur indiquée sur la carte ; ×2 si l'événement JO ou le super-pouvoir Art de vivre est actif).
- **Super-pouvoirs** et **offres diplomatiques** : voir §4 et §9.

### Érosion (pour que l'influence puisse se reprendre)
Au début de la résolution de chaque tour, avant les gains : `influence[N][T] = influence[N][T] × 0,9` pour tous les couples.

### Zone d'influence (« owner »)
Pour chaque N, après les gains :
- `best` est l'équipe avec le score le plus haut. Si `score(best) >= 4` **et** `score(best) > score(second) + 0,5`, alors `owner(N) = best`.
- Sinon, en cas d'égalité ou d'écart trop faible, l'owner actuel est conservé (si son score est encore ≥ 4) ; à défaut, le pays devient neutre.
- Les pays d'équipe ne changent jamais d'owner.

### Rejet culturel
- Chaque équipe a un compteur `rejection`, de 0 à 10, qui démarre à 0.
- Les cartes « forcing » ajoutent du rejet (indiqué sur la carte). Les **Bourses étudiantes** en retirent.
- Si une équipe n'a joué **aucune** carte qui ajoute du rejet ce tour : `rejection −1` (minimum 0).
- **Si rejection ≥ 5 en fin de résolution** : un gros titre s'affiche, *« 🚫 Cultural backlash! The world is tired of [Pays]. »* Toute l'influence de l'équipe est **divisée par 2** sur toute la carte, on recalcule les owners, puis `rejection = 1`.

### Planète commune
- `globalPlanet = somme des jauges planet des 5 équipes` (de 0 à 50 ; au départ 2+5+6+3+8 = 24).
- Après chaque `reveal`, si `globalPlanet < 18`, le bandeau d'alerte **« 🌡️ The planet is overheating »** reste affiché sur l'hôte et chez les joueurs.
- **À la fin** (ou dès qu'on passe sous 10 à n'importe quel tour) : si `globalPlanet < 15`, c'est l'écran **« GAME OVER — The planet lost. Everybody loses. »** Le classement s'affiche quand même, mais grisé.

### Score final
`score(T) = nombre de pays dans la zone de T (sans compter son propre pays)`. En cas d'égalité, on départage par la somme des influences, puis par l'attractivité.

---

## 8. Ordre de résolution d'un tour (action hôte `reveal`)

1. Charger `game` ; si `game.resolvedTurn === turn`, s'arrêter (idempotence).
2. Lister et charger tous les choix du tour : picks, actions Président, actions Voix, offres et réponses.
3. Pour les équipes bot, générer leurs choix (§15).
4. Appliquer la **grève** (elle annule la carte `eco` ou `ecolo` visée), puis le **veto** du Président (il annule une carte, sauf la grève).
5. **Érosion** de l'influence (×0,9).
6. Appliquer les **effets de base de l'événement** sur les jauges, avec leurs conditions (§12).
7. Appliquer les **effets de jauges des cartes** jouées (dans l'ordre president, eco, ecolo, culture, voice), puis les effets de rejet.
8. Appliquer les **offres diplomatiques** acceptées (§9).
9. Appliquer les **super-pouvoirs** déclenchés (effets de jauge et de rejet).
10. **Écrêter** toutes les jauges entre 0 et 10.
11. Calculer `attract` pour chaque équipe.
12. **Gains d'influence passifs** pour chaque couple (équipe, pays éligible), avec l'éligibilité calculée sur les owners de **début de tour**.
13. **Bonus ciblés** : cartes Culture, super-pouvoirs d'influence, influence partagée des offres.
14. Calculer les **owners**.
15. Vérifier le **rejet culturel** (≥ 5), avec division par 2 puis nouveau calcul des owners si besoin.
16. Calculer `globalPlanet` et les alertes.
17. Générer les **gros titres** (§13) et la liste ordonnée des **changements de carte** pour l'animation.
18. Écrire `game` : jauges, influence, owners, rejet, historique du tour (cartes jouées par équipe, deltas), titres, `resolvedTurn = turn`, `phase = "reveal"`.
19. Si `turn === 6` (ou si le game over est immédiat), l'action « Next » mène à `end`.

Garde aussi un **journal** par tour (`game.history[turn]`), pour l'écran de fin et pour le débogage.

---

## 9. Diplomatie (simple)

- En phase `decide`, chaque Diplomate peut envoyer **une offre** à une autre équipe : il choisit l'équipe et le **type**.
  - `trade` (accord commercial) : les deux équipes gagnent 💰 +1.
  - `climate` (accord climat) : les deux équipes gagnent 🌍 +1 et perdent 💰 −1. Le gros titre est positif.
  - `culture` (échange culturel) : les deux équipes gagnent +1 d'influence sur chaque pays non joué éligible **pour les deux**. Si aucun ne l'est, chacune gagne 🙂 +1.
- Le Diplomate de l'équipe qui reçoit l'offre la voit apparaître dans son panneau, avec **Accepter** ou **Refuser**. Il peut accepter **plusieurs** offres, mais une seule de chaque type par tour.
- Une offre sans réponse à la fin de `decide` (ou de `validate`) est **refusée** par défaut.
- Si l'équipe qui reçoit est un bot : elle accepte `trade` et `culture` ; elle accepte `climate` seulement si sa jauge planet est ≤ 5.
- Gros titre : *« 🤝 Sweden and Brazil sign a climate pact. »*

---

## 10. Les cartes

Chaque carte a cette forme :
```js
{
  id, role, name, emoji, flavor,                  // flavor = 1 phrase fun
  fx: { eco, planet, happy, cohesion },           // deltas de jauge (0 si absent)
  tags: ["climat", ...],                          // besoins auxquels la carte répond (cardMatch)
  influence: 0,                                   // cartes Culture : bonus sur la cible
  global: false,                                  // true = la cible peut être n'importe quel pays
  rejection: 0,                                   // >0 ajoute du rejet, <0 en retire
  special: null                                   // identifiant d'un effet particulier
}
```

### Distribution
- À chaque tour, chaque **rôle** de chaque équipe reçoit **3 cartes** tirées de la pioche de son rôle. Le tirage est **déterministe** : `rng(seed = gameId + turn + team + role)`.
- Une carte **jouée** par l'équipe ne revient plus pour ce rôle dans les tours suivants (si la pioche est trop petite, on la recycle).
- La carte affiche son nom, son emoji, sa phrase fun, ses effets en icônes (`💰+2 🌍−1`), ses tags (`🌊 ⚡`) et, si besoin, `⚠️ Backlash +2`.

### 🏭 Pioche Économie & Travail (`eco`)
| id | Nom | fx | tags | flavor |
|---|---|---|---|---|
| `eco_4day` | 4-day week | eco −1, happy +2, cohesion +1 | burnout | "Friday is the new Saturday." |
| `eco_robots` | 100% robot factories | eco +3, happy −1, cohesion −2 | tech | "The robots don't unionise. Yet." |
| `eco_ubi` | Universal basic income | eco −2, happy +1, cohesion +2 | egalite | "Free money. What could go wrong?" |
| `eco_uber` | Uberise everything | eco +2, happy −2, cohesion −1 | emploi | "Everyone is a freelancer now. Congrats." |
| `eco_aitraining` | National AI training plan | eco +1, happy +1 | tech, emploi | "Junior consultants learn to prompt." |
| `eco_reshore` | Bring factories home | eco +1, cohesion +1, planet −1 | emploi | "Made at home, again." |
| `eco_remote` | Remote work for all | happy +1, planet +1, cohesion −1 | ville, burnout | "Meetings in pyjamas, officially." |
| `eco_startup` | Start-up nation | eco +2, cohesion −1 | tech | "Ten unicorns, zero interns paid." |
| `eco_coops` | Worker co-ops | eco −1, happy +1, cohesion +2 | egalite, emploi | "The workers own the factory now." |

### 🌱 Pioche Écologie (`ecolo`)
| id | Nom | fx | tags | flavor |
|---|---|---|---|---|
| `eco_carbontax` | Carbon tax | eco −1, planet +3, cohesion −1 | climat | "Polluters pay. Some people yell." |
| `eco_15min` | 15-minute city | planet +1, happy +1 | ville | "Your whole life, walking distance." |
| `eco_drill` | Drill baby drill | eco +2, planet −3 | energie | "Cheap gas, hot summers." |
| `eco_nuclear` | Nuclear power | eco +1, planet +1, cohesion −1 | energie | "Clean-ish, scary-ish." |
| `eco_solar` | Solar everywhere | eco −1, planet +2 | energie, climat | "Every roof is a power plant." |
| `eco_nosuv` | Ban SUVs in cities | planet +2, cohesion −1 | ville | "Bye-bye, giant cars." |
| `eco_sobriety` | Happy sobriety | eco −2, planet +2, happy +1 | climat | "Need less, live more." |
| `eco_forest` | Giant reforestation | eco −1, planet +2 | climat | "A billion trees and counting." |
| `eco_ev` | Electric car subsidies | planet +1 | energie | "Same traffic jam, but silent." |

### 🎬 Pioche Culture (`culture`) : il faut choisir une cible
| id | Nom | influence | global | fx | rejection | flavor |
|---|---|---|---|---|---|---|
| `cul_series` | Hit streaming series | +3 | oui | — | 0 | "The whole world binge-watched it." |
| `cul_fashion` | Fashion week | +2 (+1 en plus si la cible a le besoin `fete`) | non | — | 0 | "Everyone copies your style." |
| `cul_food` | Cuisine listed by UNESCO | +2 | non | happy +1 | 0 | "Your food, everywhere." |
| `cul_influencers` | Influencer campaign | +3 | oui | — | +1 | "#Sponsored." |
| `cul_festival` | Giant music festival | +2 (×2 si la cible a le besoin `fete`) | non | happy +1 | 0 | "Three days, zero sleep." |
| `cul_scholarships` | International scholarships | +2 | non | eco −1 | **−2** | "Come study with us." |
| `cul_esport` | Esport & football league | +2 | oui | — | 0 | "Your teams, their idols." |
| `cul_ads` ⚠️ | Massive ad blitz | +4 | non | — | **+2** | "You can't escape our ads." |
| `cul_pressure` ⚠️ | Trade pressure | +5 | non | eco +1 | **+3** | "Nice economy you have there…" |

### 👑 Pioche Président (`president`)
| id | Nom | fx / effet | flavor |
|---|---|---|---|
| `pre_un` | Speech at the UN | special `un_speech` : +1 d'influence sur chaque pays déjà dans sa zone | "Standing ovation." |
| `pre_stimulus` | Stimulus plan | eco +2, planet −1 | "Money printer goes brrr." |
| `pre_referendum` | Referendum | cohesion +2, eco −1 | "The people have spoken. Loudly." |
| `pre_austerity` | Austerity budget | eco +1, happy −1, cohesion −1 | "Tighten your belts." |
| `pre_climatesummit` | World climate summit | special `climate_summit` : 🌍 +1 pour **toutes** les équipes, 💰 −1 pour la sienne | "Everyone signs. Will they deliver?" |
| `pre_school` | Invest in schools | eco −1, happy +1, cohesion +1 | "Tomorrow's voters, today's pupils." |
| `pre_health` | Free healthcare for all | eco −1, cohesion +2 | "Health is not a job perk." (clin d'œil au Treaty of Detroit) |

### 📣 Pioche Voix du peuple (`voice`) : les revendications
| id | Nom | fx | tags | flavor |
|---|---|---|---|---|
| `voi_wages` | March for wages | eco −1, cohesion +1 | egalite | "We want our share." |
| `voi_tangping` | Lying-flat movement | eco −1, happy +1 | burnout | "Not today, capitalism." |
| `voi_climate` | Youth climate strike | planet +1, cohesion −1 | climat | "There is no planet B." |
| `voi_4day` | 4-day week petition | happy +1 | burnout | "1 million signatures." |
| `voi_peace` | Social peace | cohesion +1 | — | "Everyone chills. For now." |
| `voi_housing` | Housing protest | cohesion +1, eco −1 | ville | "Rent is too damn high." |

La **grève** (`strike`) n'est pas une carte : c'est un bouton spécial du panneau Voix, utilisable une fois par partie (§5).

---

## 11. Équilibrage : objectifs à atteindre avec `scripts/simulate.mjs`

Écris un simulateur qui joue **1000 parties** de bots (§15), avec des équipes au hasard entre « bot prudent » et « bot agressif ». Il affiche :
- le taux de victoire de chaque pays : **aucun pays au-dessus de 30 %**, aucun sous 10 % ;
- le nombre moyen de pays dans la zone du vainqueur : **entre 6 et 10** ;
- le taux de game over planète : **entre 20 % et 40 %** (le twist doit être possible sans être systématique) ;
- le nombre moyen de changements d'owner par tour : **au moins 3** (la carte doit bouger à chaque révélation) ;
- le nombre moyen de rejets culturels par partie, autour de 1.

Si les objectifs ne sont pas atteints, ajuste **uniquement** ces constantes, regroupées en haut de `engine.mjs` : seuil d'owner (4), écart (0,5), érosion (0,9), seuil de rejet (5), pénalité de rejet (0,7), seuils planète (18 / 15 / 10), diviseurs de `passive` et `match` (5). Note les valeurs finales et les résultats dans le README.

---

## 12. Les événements

Le tour 1 tire toujours `ev_chatgpt` et le tour 6 toujours `ev_summit`. Les tours 2 à 5 tirent 4 événements différents parmi les autres, avec le seed `gameId`.
Les **conditions** portent sur l'état de l'équipe **avant** les cartes du tour (jauges) ou sur les cartes **jouées ce tour** (tags et ids). Comme l'événement est annoncé avant les décisions, les équipes peuvent y réagir.

| id | Année (indicative) | Titre de « une » | Effets |
|---|---|---|---|
| `ev_chatgpt` | 2030 | **"ChatGPT 9 replaces every junior consultant"** | Toutes les équipes : eco +1, happy −1. Une équipe qui joue une carte taguée `tech` ou `eco_aitraining` gagne happy +1. Une équipe qui n'en joue pas : cohesion −1. |
| `ev_heatwave` | — | **"Heatwave: 48°C in Paris, café terraces closed"** | Toutes : planet −1. Une équipe avec planet ≥ 6 ne subit pas : happy −1. Les autres : happy −1. Une carte taguée `climat` donne happy +1. |
| `ev_tangping` | — | **"Lying flat goes global: young people stop working"** | Toutes : eco −1, sauf si happy ≥ 6. Une carte taguée `burnout` donne happy +1. Les pays au besoin `burnout` comptent ×1,5 ce tour (`eventMultiplier`). |
| `ev_oil` | — | **"Oil hits $300 a barrel"** | Une équipe avec planet ≤ 3 : eco −2. Une carte taguée `energie` donne eco +1. Les pays au besoin `energie` comptent ×1,5. |
| `ev_olympics` | — | **"World Olympics: the planet is watching"** | Les cartes Culture ont leur influence ×2 ce tour. Les pays au besoin `fete` comptent ×1,5. |
| `ev_burnout` | — | **"Global burnout epidemic"** | Toutes : happy −1. Une équipe qui joue `eco_4day`, `voi_4day` ou `eco_remote` gagne happy +2. Les pays au besoin `burnout` comptent ×2. |
| `ev_tiktok` | — | **"TikTok banned everywhere"** | Ce tour, aucune carte Culture n'est `global` (la cible doit être éligible). `cul_influencers` ne donne que +1. |
| `ev_crash` | — | **"Global stock market crash"** | Toutes : eco −2. Une équipe avec cohesion ≥ 6 ne perd que eco −1. |
| `ev_quit` | — | **"The Great Resignation 2.0: offices are empty"** | Toutes : cohesion −1. Une carte taguée `egalite` ou `burnout` donne cohesion +1. |
| `ev_floods` | — | **"Giant floods hit coastal cities"** | Toutes : planet −1. Les pays au besoin `climat` comptent ×2. |
| `ev_robotstrike` | — | **"Delivery riders strike against the robots"** | Une équipe qui joue `eco_robots` ou `eco_uber` : cohesion −2. Une carte taguée `egalite` donne cohesion +1. |
| `ev_summit` | 2050 | **"2050: The Great World Summit, the final verdict"** | Les gains d'influence de ce tour sont ×1,5. Le bandeau d'alerte planète est forcé, avec le chiffre exact. |

Les années affichées sont 2030, 2034, 2038, 2042, 2046 et 2050 (une par tour).
Chaque événement a aussi une phrase d'accroche fun (« sous-titre ») et une ligne **« What it means for you »** qui explique en clair quelles cartes aident. Écris-les toutes.

---

## 13. Gros titres (le côté fun)

Après chaque résolution, génère **5 à 10 gros titres** courts, à partir de gabarits. Exemples :
- Un pays rejoint une zone : `"🇲🇽 Mexico takes inspiration from 🇫🇷 France's 15-minute city."` (cite la carte qui a le plus aidé, sinon le besoin)
- Un pays change de zone : `"🇯🇵 Japan now looks to 🇸🇪 Sweden instead of 🇺🇸 USA."`
- Un rejet culturel : `"🚫 Cultural backlash! The world is tired of 🇨🇳 China's ads."`
- Une grève : `"📣 General strike in 🇫🇷 France: the carbon tax is cancelled."`
- Un veto : `"👑 The 🇧🇷 Brazilian president vetoed 'Drill baby drill'."`
- Une jauge au plus bas : `"😮‍💨 Happiness in 🇨🇳 China hits rock bottom."`
- Un rôle qui n'a pas joué : `"☕ 🇺🇸 USA's Ministry of Ecology was on a coffee break."`
- La planète : `"🌡️ Global planet score: 17/50, the scientists are worried."`

**Ton** : drôle et taquin, jamais méchant, jamais de stéréotype national. Tous les textes de l'interface sont **en anglais** (le cours est présenté en anglais), mais regroupe-les tous dans un objet `TEXT` dans `data.mjs` pour pouvoir passer facilement au français.

---

## 14. Interface et style

### Direction visuelle
Moderne, neutre et ludique, avec un côté « jeu de plateau et JT de 2050 ». Fond sombre bleu nuit pour l'écran hôte projeté (lisible au vidéoprojecteur), cartes claires et arrondies, couleurs d'équipe vives.
- Polices : **Space Grotesk** (titres, chiffres) et **Inter** (texte), via Google Fonts.
- Définis les couleurs comme variables CSS dans `:root`. L'écran hôte est sombre par défaut. L'écran joueur suit `prefers-color-scheme`, avec un thème clair et un thème sombre.
- Les gros chiffres utilisent `font-variant-numeric: tabular-nums`.
- Pas de scroll horizontal. L'écran joueur est utilisable de 360 px (téléphone) à 1440 px (portable).
- Animations sobres (pulsation, fondu, apparition des titres), toutes désactivées sous `prefers-reduced-motion`.
- Accessibilité : contrastes AA, boutons ≥ 44 px, focus visible, jamais la couleur seule pour porter une information (drapeaux, icônes et libellés en plus).

### Écran hôte (`host.html`), en 16:9 plein écran
- **Barre du haut** : « SOFT POWER 2050 », l'année et le tour (« 2038 · Turn 3/6 »), la phase, un gros **timer** et une barre de progression.
- **Centre** : la **carte** (environ 65 % de la largeur).
- **Droite** : 5 **panneaux d'équipe** empilés, chacun avec drapeau, nom, nombre de joueurs, 4 mini-jauges (barres segmentées de 0 à 10, avec l'icône), l'attractivité, le compteur de rejet (🔥 de 0 à 5), le super-pouvoir (disponible ou utilisé) et le nombre de pays dans sa zone. En phase `decide`, une rangée de pastilles de rôle se coche (✓) quand le rôle a choisi.
- **Bas** : un **bandeau de gros titres** défilant, plus la jauge **Planète commune** (thermomètre de 0 à 50, avec les seuils 18 et 15 marqués).
- **Écrans plein cadre selon la phase** :
  - `lobby` : un grand QR code vers `location.origin + "/"`, l'URL en clair, les 5 colonnes d'équipe avec les pseudos qui arrivent en direct, le total des joueurs, et les boutons « Balance teams » et « Start game ».
  - `roles` : la carte de départ et le texte *« 2030. The American Dream is over. Who will the world dream of next? »*
  - `event` : une « **une** » de journal (« THE WORLD TIMES · 2038 ») avec le titre, le sous-titre et la ligne « What it means for you ».
  - `reveal` : l'animation de la carte, les titres un par un, puis un récapitulatif des deltas de jauges par équipe (`💰+1 🌍−2 …`).
  - `end` : un **podium** (top 3), la carte finale, la jauge planète, puis selon le cas *« GAME OVER — the planet lost »* ou *« The planet survived »*. Viennent ensuite les **récompenses fun** :
    - « Happiest country »
    - « Biggest polluter »
    - « Backlash champion »
    - « Diplomat of the year » (le plus d'offres acceptées)
    - « Most copied idea » (la carte qui a le plus contribué à des gains d'influence)

    Pour finir, la **question du débat**, en grand : *« Should the best model become everyone's model? »*
- **Panneau de contrôle hôte** (repliable, en bas à gauche) : saisie de la clé, Next, Close now, réglage du timer, Reset (double clic), et une liste des joueurs avec la possibilité d'en déplacer un d'une équipe à l'autre (en lobby).

### Écran joueur (`index.html`)
- **Rejoindre** : pseudo, puis choix d'équipe (5 boutons aux couleurs des pays avec le nombre de joueurs, et « Auto »), puis « Join ».
- **Attente** : *« You're in team 🇸🇪 Sweden. Keep this page open. »*, avec la liste des coéquipiers.
- **Carte de rôle** (phase `roles`) : une grande carte façon « carte de personnage » : emoji, nom du rôle, ce qu'il fait en 2 lignes, et un « secret tip » propre au rôle (par exemple, Écologie : « If the planet dies, nobody wins. Not even you. »). Si le joueur a plusieurs rôles, il en voit plusieurs.
- **Décision** (phase `decide`) :
  - en haut, le timer et un rappel de l'événement (titre et « What it means for you ») ;
  - les jauges de **son** équipe, l'attractivité et le rejet ;
  - **un onglet par rôle** tenu par le joueur ; dans chaque onglet, **3 cartes** cliquables (on peut changer d'avis jusqu'à la fin du timer, et le choix est enregistré à chaque clic) ;
  - pour une carte Culture : une **mini-carte** apparaît, avec les pays éligibles surlignés (ou tous si la carte est mondiale), et on clique la cible ;
  - un indicateur du nombre de rôles de l'équipe qui ont déjà choisi ;
  - **onglet Diplomate** : les jauges et zones de toutes les équipes, un formulaire « Send an offer » (équipe et type), et la liste des offres reçues avec Accepter / Refuser.
- **Validation** (phase `validate`) :
  - **Président** : la liste des cartes choisies par l'équipe, un bouton « Veto » sur chacune (une seule à la fois), un bouton « Use super-power » (avec le choix des cibles si besoin : 1 pays pour Hollywood, 3 pays éligibles pour Routes de la soie), puis « Confirm » ;
  - **Voix du peuple** : le bouton « 📣 Call a general strike » (s'il n'a pas encore servi), avec le choix de la carte visée (eco ou ecolo) ;
  - les autres voient les choix de l'équipe en lecture seule, avec *« Your president is deciding… »*.
- **Révélation** : les deltas de **son** équipe, les gros titres qui concernent son équipe, et la mini-carte mise à jour.
- **Fin** : le classement, la place de son équipe, la récompense éventuelle, la question du débat.
- Si la connexion tombe, un bandeau « Reconnecting… » s'affiche, et le joueur revient automatiquement là où il en était.

---

## 15. Bots (équipes vides et simulateur)

- **Bot prudent** : pour chaque rôle, il choisit la carte qui maximise `Δ(attract) + 0,5 × Δplanet`, en évitant les cartes qui ajoutent du rejet. Culture : il cible le pays éligible où l'écart avec le leader est le plus faible. Il utilise son super-pouvoir au tour 4. Il n'oppose jamais de veto et ne fait jamais grève.
- **Bot agressif** : il maximise `Δeco + influence`, joue les cartes ⚠️ dès que son rejet est ≤ 2, et utilise son super-pouvoir au tour 2.
- Les équipes vides en classe utilisent le **bot prudent**. Signale-les sur l'écran hôte avec « 🤖 Bot ».
- Un bot ne doit jamais faire planter la résolution, même avec une pioche épuisée ou aucun pays éligible.

---

## 16. Plan de travail (à suivre dans l'ordre)

Commit à chaque étape avec un message clair. Termine chaque étape par `npm test`.

1. **Squelette** : `package.json`, `netlify.toml`, l'arborescence et un README minimal.
2. **Données** (`data.mjs`) : pays, voisinages, besoins, équipes, rôles, cartes, événements et textes, exactement comme dans cette spec. Tests : symétrie des voisinages, unicité des ids, toutes les cartes valides, chaque pays d'équipe a au moins 4 voisins.
3. **Moteur** (`engine.mjs` + `rng.mjs`) : fonctions pures `initGame`, `assignRoles`, `dealCards`, `eligible`, `resolveTurn`, `computeOwners`, `finalScores`, `headlines`. Tests unitaires pour chaque règle des §5, §7, §8, §9 et §12, en particulier : idempotence, grève et veto, rejet ≥ 5, game over, égalités d'owner, rôles pour n = 0 à 9.
4. **Simulateur** (`scripts/simulate.mjs`) : ajuste les constantes jusqu'à atteindre les objectifs du §11, puis note les résultats dans le README.
5. **API** (fonctions Netlify + `store.mjs` + `view.mjs`) : `state`, `join`, `pick`, `team` et `host` (actions `check`, `start`, `next`, `close`, `reveal`, `end`, `reset`, `setTimer`, `movePlayer`, `balance`). Valide toutes les entrées (le rôle appartient bien au joueur, la phase est la bonne, la carte fait partie de sa main, la cible est éligible). Réponds en JSON avec `cache-control: no-store`. `/api/state?pid=` renvoie l'état public plus la partie privée du joueur (ses rôles, ses mains, ses choix, et pour le Président les choix de l'équipe). **Ne renvoie jamais les mains ni les choix des autres équipes avant le reveal.** Tests d'API avec un Blobs mocké.
6. **Carte SVG** (`map.js`) : le rendu, puis l'animation de reveal. Vérifie le rendu avec une page de démo locale.
7. **Écran hôte** : toutes les phases.
8. **Écran joueur** : toutes les phases et tous les rôles, y compris les rôles multiples, la mini-carte de ciblage, la diplomatie et la validation.
9. **Test de bout en bout** avec Playwright, déjà installé sur la machine : `require('playwright')`, ne lance **pas** `playwright install`. Mocke `/api` ou lance `netlify dev` si c'est disponible. Simule 1 hôte et 12 joueurs (headless) répartis dans les 5 équipes, joue une partie complète en accéléré (timers à 5 s), puis prends des captures d'écran de chaque phase (hôte en 1920×1080, joueur en 390×844 et 1366×768). Corrige tout ce qui déborde ou se chevauche.
10. **Charge** : un script qui simule 30 joueurs faisant du polling toutes les 1,5 s et cliquant pendant 150 s contre `netlify dev`. Vérifie qu'il n'y a ni erreur ni choix perdu.
11. **README** en français :
    - la mise en ligne via GitHub et Netlify ;
    - où définir `HOST_KEY` (*Project configuration → Environment variables*, puis *Deploys → Trigger deploy*) ;
    - le déroulé le jour J, minute par minute ;
    - la répétition la veille avec 3 ou 4 téléphones, puis « Reset » ;
    - que faire si le wifi tombe ;
    - comment modifier les cartes et les événements dans `data.mjs`.
12. **Ne déploie rien et ne pousse rien sans me demander.** Quand tout est prêt, dis-moi quels fichiers pousser et vers quel dépôt.

---

## 17. Déroulé visé le jour J (≈ 30 min)

| Minute | Phase |
|---|---|
| 0–3 | Lobby : les joueurs scannent et rejoignent leur équipe ; l'animateur explique en 1 minute |
| 3–4 | Roles : chacun découvre son rôle |
| 4–29 | 6 tours × ~4 min (event 30 s + decide 150 s + validate 30 s + reveal ~40 s) |
| 29–30 | End : podium, verdict planète, récompenses, puis la question du débat |

Le timer de `decide` doit pouvoir passer à 90 s si la classe est en retard (réglage hôte en cours de partie).

---

## 18. Critères d'acceptation

- [ ] 30 joueurs en même temps, sans erreur ni choix perdu (test de charge).
- [ ] Un joueur qui recharge sa page retrouve son équipe, ses rôles et ses choix.
- [ ] Le jeu fonctionne de 1 à 40 joueurs (rôles fusionnés ou partagés, équipes bot).
- [ ] La carte change de couleurs de façon visible à chaque révélation.
- [ ] Aucun texte de l'interface ne parle de conquête, de capture ou de conversion d'un pays.
- [ ] Le game over planète est possible, mais pas systématique (simulateur).
- [ ] La clé hôte n'apparaît nulle part dans le code ni dans le dépôt.
- [ ] `npm test` passe ; les captures Playwright de toutes les phases sont propres sur téléphone, portable et projecteur.
- [ ] Le README permet à quelqu'un qui n'a jamais vu le projet de le mettre en ligne et de l'animer.
