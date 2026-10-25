# Soft Power 2050

Jeu multijoueur en équipes, au tour par tour, ≈ 30 minutes, pour clore l'atelier
*« La crise d'un modèle : quels horizons… après l'American Way of Life »* (Master 128 MBC, Paris-Dauphine).

- **Écran joueur** : `/` (le QR code y mène) — téléphone ou portable, aucun compte.
- **Écran hôte** : `/host.html` — à projeter, piloté par l'animateur.
- 5 équipes (🇺🇸 🇫🇷 🇸🇪 🇨🇳 🇧🇷), 6 tours (2030 → 2050), la plus grande zone d'influence gagne… sauf si la planète commune s'effondre.

Stack : HTML/CSS/JS vanilla sans build (`public/`), Netlify Functions v2 (`netlify/functions/`), Netlify Blobs (`@netlify/blobs` 11.1.2), polling toutes les 1,5 s.

---

## Les règles en 5 points (à dire à la classe)

1. 🎯 **But** : avoir le plus de pays dans sa zone d'influence en 2050.
2. 🃏 **Chaque tour**, chaque rôle choisit 1 carte, qui change les 4 jauges de son pays : 💰 croissance, 🌍 planète, 🙂 bonheur, 🤝 cohésion.
3. 🗺️ **Les pays voisins ont un besoin** (👷 emplois, 🌊 climat, 😮‍💨 burn-out, 🎉 fête…). Y répondre (jauges hautes, cartes qui les « séduisent ») rapporte de l'influence : à 4 points, avec une avance nette, ils rejoignent la zone. L'influence s'use de 10 % par tour.
4. 🔥 **Les cartes ⚠️ forcent l'influence** : à 3 🔥 les gains baissent, à 5 🔥 c'est le rejet culturel (moitié de l'influence perdue).
5. 🌍 **Chaque pays perd 2 🌍 par tour.** Planète commune sous 17 à la fin (ou sous 5 en cours de partie) : tout le monde perd.

*« Fais envie à tes voisins, ne les force pas, et ne laisse pas la planète couler. »*

**Bonus : l'objectif secret.** Chaque équipe reçoit en début de partie un objectif caché, que seule elle voit sur ses téléphones. Par exemple : « Avoir 🇯🇵 Japon dans ta zone en 2050 », « Finir avec 🌍 à 7 ou plus », « Ne jamais dépasser 2 🔥 ». Réussi, il rapporte **+2 points** au classement final, qui compte les pays de la zone plus ce bonus. Les objectifs sont révélés sur le grand écran à la fin.

Dans le jeu :
- l'écran hôte projette ces règles pendant la phase Rôles ;
- chaque téléphone les affiche avec sa carte de rôle, puis à tout moment avec le bouton **❓ Règles** ;
- pendant la décision, chaque carte indique les pays qu'elle **séduit** (« 💘 Séduit : 🇲🇽 Mexique, 🇨🇱 Chili ») ;
- le panneau **🗺️ Tes pays en jeu** montre, pour chaque pays atteignable, l'influence de l'équipe (ex. 2,8/4) et qui est en tête.
- aux **tours 1 et 2**, une carte par rôle porte le badge **⭐ Conseil** : c'est le choix d'un joueur prudent ;
- après chaque révélation, le téléphone explique **🔎 Pourquoi ?** : « 🇲🇽 Mexique a rejoint ta zone : attractivité +1,2 · besoin 🏙️ +1,4 · Ville du quart d'heure +1,0 », ou qui t'a dépassé, ou le pays le plus proche de basculer ;
- sur l'écran projeté, les pays qui **peuvent basculer au prochain tour** clignotent (pointillés blancs, légende en haut à gauche) ;
- à la fin, avant le podium, l'écran hôte **rejoue la carte de 2030 à 2050**, puis enchaîne podium → objectifs secrets → récompenses → question du débat (→ à chaque fois) ;
- **sons** sur l'écran hôte uniquement (flash info, bascule d'un pays, compte à rebours, verdict). Ils sont générés par le navigateur, sans fichier audio, et se coupent dans le panneau ⚙️ Animateur (case « 🔊 Sons »). Le navigateur n'autorise le son qu'après un premier clic ou une première touche sur la page hôte.

## Langues

Le jeu est en **français par défaut**, sur l'écran hôte comme chez les joueurs. L'anglais reste disponible :
- **Joueurs** : boutons « 🇫🇷 Français / 🇬🇧 English » en bas de chaque écran. Le choix est mémorisé sur le téléphone (clé `sp_lang`), et chaque joueur peut avoir sa propre langue dans la même partie.
- **Hôte** : sélecteur *Langue* dans le panneau ⚙️ Animateur, ou touche **L** (clé `sp_lang_host`).
- Les gros titres sont générés côté serveur dans les deux langues, chaque écran affiche la sienne.

## Trailer vidéo

`trailer/soft-power-2050-trailer.mp4` : un trailer de 74 s (1080p, avec musique) qui présente le jeu et ses 5 règles, à projeter en ouverture de séance. Il est aussi publié sur le site : **`https://<votre-site>.netlify.app/trailer.mp4`**. Après une régénération, recopier la vidéo dans `public/trailer.mp4`. Pour le régénérer après une modification (ffmpeg requis : `brew install ffmpeg`) :

```bash
node trailer/render.mjs
```

- `trailer/trailer.html` contient les scènes. Chaque image est calculée à partir du temps et capturée par Playwright, ce qui donne une vidéo parfaitement fluide.
- `trailer/music.mjs` synthétise la bande-son (sans fichier audio).
- `trailer/timeline.mjs` donne les temps des scènes, partagés par l'image et le son.
- `node trailer/render.mjs --stills 10 30` produit des aperçus PNG.

## 1. Mise en ligne (GitHub + Netlify)

1. **Créer le dépôt GitHub** (vide, privé ou public) puis, dans ce dossier :
   ```bash
   git remote add origin https://github.com/<vous>/soft-power-2050.git
   git push -u origin main
   ```
   (le dépôt local contient déjà tous les commits, un par étape du plan de travail).
2. **Créer le site Netlify** : *Add new project → Import an existing project → GitHub* → choisir le dépôt.
   Les réglages sont lus dans `netlify.toml` (publish = `public`, functions = `netlify/functions`) : ne rien changer, cliquer *Deploy*.
3. **Définir la clé hôte** (obligatoire) : *Project configuration → Environment variables → Add a variable*
   - Key : `HOST_KEY`
   - Value : un mot de passe de votre choix (ne le notez nulle part dans le code ni dans ce dépôt).
   Puis *Deploys → Trigger deploy → Deploy project* pour que la variable soit prise en compte.
4. Ouvrir `https://<votre-site>.netlify.app/host.html`, saisir la clé une fois (elle est gardée dans le navigateur de l'ordinateur hôte, clé `sp_host_key`) : le lobby et le QR code s'affichent.

Netlify Blobs est activé automatiquement sur le site, il n'y a pas de base de données à configurer.

---

## 2. Déroulé le jour J (≈ 30 min)

Avant le cours : ouvrir `/host.html` sur l'ordinateur relié au projecteur, en plein écran (F11), et vérifier que le lobby s'affiche. Si une ancienne partie traîne, appuyer deux fois sur **R** pour faire un reset.

| Minute | Ce qui se passe | Ce que fait l'animateur |
|---|---|---|
| 0–3 | **Lobby** : les étudiants scannent le QR code, entrent un pseudo et choisissent un pays (ou 🎲 Auto). Les noms apparaissent en direct. | Expliquer en 1 minute : « Faites envie au monde. Le pays qui a la plus grande zone d'influence en 2050 gagne. Mais si la planète tombe sous 17/50, tout le monde perd. » Si les équipes sont déséquilibrées : **⚖️ Balance teams**. Puis **Start game** (ou →). |
| 3–4 | **Roles** : chacun découvre sa carte de rôle sur son téléphone. | → pour lancer le premier événement. |
| 4–29 | **6 tours** d'environ 4 min : **Event** (la une du journal, ~30 s) → **Decide** (150 s, chaque rôle choisit une carte) → **Validate** (30 s, le président peut opposer son veto et déclencher le super-pouvoir, la Voix du peuple peut lancer la grève) → **Reveal** (animation de la carte et gros titres, ~40 s). | Lire la une à voix haute, puis → à chaque étape. Pendant Decide, les pastilles ✓ montrent les rôles qui ont choisi : on peut fermer plus tôt avec → (*Close now*). |
| 29–30 | **End** : rejeu de la carte 2030 → 2050, puis → podium et verdict, → objectifs secrets, → récompenses, → **la question du débat** : *« Le meilleur modèle doit-il devenir celui de tout le monde ? »* | Lancer le débat. |

**En retard ?** Dans le panneau ⚙️ Host (en bas à gauche), régler le timer *Decide* sur 90 s puis *Set*. Le changement s'applique aussi au tour en cours.

Raccourcis hôte : **→** ou **Espace** = action suivante logique · **R** deux fois = reset.
Un joueur qui recharge sa page retrouve automatiquement son équipe, ses rôles et ses choix. Un retardataire peut rejoindre en cours de partie : il est placé dans l'équipe la moins nombreuse.

---

## 3. Répétition la veille (10 minutes)

1. Ouvrir `/host.html` sur l'ordinateur et prendre 3 ou 4 téléphones (ou des onglets en navigation privée).
2. Rejoindre avec chaque téléphone, choisir des pays différents (les pays vides sont joués par un 🤖 bot).
3. Jouer 1 ou 2 tours en entier : choisir des cartes, cibler un pays avec une carte Culture, envoyer une offre diplomatique, tester le veto, la grève et le super-pouvoir.
4. Vérifier que le QR code est lisible depuis le fond de la salle sur le projecteur.
5. **Reset** (R deux fois, ou double-clic sur *Reset* dans le panneau) : la partie et les joueurs sont effacés, le lobby est prêt pour le lendemain.

---

## 4. Si le wifi tombe

- **Côté joueurs** : un bandeau « Reconnecting… » s'affiche et la page se reconnecte seule. Aucun choix enregistré n'est perdu, chacun est stocké côté serveur dès le clic. Si un téléphone reste bloqué, il suffit de **recharger la page** : le joueur retrouve sa place, son identifiant est gardé dans le téléphone.
- **Partage de connexion** : un téléphone en point d'accès 4G/5G suffit pour 30 joueurs, le jeu échange très peu de données (quelques Ko toutes les 1,5 s par joueur).
- **Côté hôte** : recharger `/host.html`, la partie reprend là où elle en était. Le minuteur est calculé à partir de l'heure du serveur.
- **Timer écoulé pendant la coupure** : pas de souci. La phase Decide se ferme toute seule, puis la validation. La révélation n'est déclenchée que par l'hôte, une seule fois, quoi qu'il arrive.
- **Plan B sans réseau** : jouer à main levée, l'hôte lit les événements à voix haute et les équipes votent sur papier. Le débat final reste le même.

---

## 5. Modifier les cartes, les événements et les textes

Tout le contenu est dans **`netlify/lib/data.mjs`** (données pures) :

- `CARDS` : une carte = `{ id, role, name, emoji, flavor, fx: { eco, planet, happy, cohesion }, tags, influence, global, rejection, special }`. Ajouter une ligne `card("eco", "eco_xxx", "Nom", "🧪", "Phrase fun", { fx: { eco: 1 }, tags: ["tech"] })`.
- `EVENTS` : titre de la une, sous-titre et ligne *What it means for you*. Les **effets** des événements sont codés dans `eventGaugeDeltas` et `eventMultiplier` (`netlify/lib/engine.mjs`).
- `TEAMS` (jauges de départ, couleurs, super-pouvoirs), `COUNTRIES` (besoins, positions), `RAW_NEIGHBORS` (liaisons de la carte).
- `TEXT.fr` / `TEXT.en` : **tous les textes de l'interface**, dans les deux langues (mêmes clés, ce que vérifie un test).
- `CONTENT_FR` : la version française des cartes, événements, rôles, pays, besoins, jauges et accords (le contenu anglais est dans les tableaux ci-dessus). `ERRORS_FR` traduit les messages d'erreur du serveur.
- Quand vous ajoutez une carte ou un événement, ajoutez aussi sa ligne dans `CONTENT_FR`. Sinon `npm test` échoue, exprès.

Après une modification : `npm test` (vérifie la validité des données) puis `npm run simulate` (vérifie l'équilibre), commit, push : Netlify redéploie tout seul.

---

## 6. Développement et tests

```bash
npm install
npm test
```

- `npm test` : 88 tests `node:test`, sans dépendance de test (données, règles du moteur, rôles pour n = 0 à 9, API avec un Blobs simulé en mémoire).
- `npm run simulate` : 1000 parties de bots, contrôle des objectifs d'équilibrage du §11.
- **Local** : `npm i -g netlify-cli`, puis lancer `netlify dev` avec une clé de test locale dans `HOST_KEY` (par exemple `HOST_KEY=une-cle-de-test netlify dev --offline`) et ouvrir http://localhost:8888/host.html.
- **Bout en bout** (Playwright, utilise le Chromium déjà en cache, sans `playwright install`) : `HOST_KEY=<même clé> node scripts/e2e.mjs`. Il joue 1 hôte + 12 joueurs sur une partie complète et enregistre les captures de chaque phase dans `screenshots/` (hôte 1920×1080, joueurs 390×844 et 1366×768). Il signale les débordements, les boutons de moins de 44 px et le scroll horizontal. Le paquet `playwright` est chargé localement ou depuis l'installation globale (`npm i -g --ignore-scripts playwright@1.58.2`, la version qui correspond au Chromium 1208 en cache). Les timers sont accélérés avec *Close now* (même chemin de code que la fin du timer, dont le minimum est 60 s).
- **Charge** : `HOST_KEY=<même clé> node scripts/load.mjs` simule 30 joueurs qui font du polling toutes les 1,5 s et cliquent pendant 150 s, puis vérifie qu'aucun choix n'est perdu. Dernier résultat contre `netlify dev` : 3056 requêtes, **0 erreur, 0 choix perdu**, p50 150 ms, p95 465 ms.
  - Remarque : l'émulateur Blobs local de `netlify dev` se bloque parfois environ 30 s sous forte charge (« Task timed out after 30 s » dans ses logs). Le test de bout en bout peut alors échouer sur un délai d'attente : il passe sur les relances. Pour encaisser ces à-coups, le client et l'hôte réessaient automatiquement leurs requêtes (toutes idempotentes) et coupent celles qui dépassent 8 à 10 s.
- `public/map-demo.html` : page de démonstration de la carte (étape 6), utile pour la développer.

### Arborescence

```
netlify.toml · package.json · README.md
netlify/lib/      data.mjs (données) · engine.mjs (règles, fonctions pures) · rng.mjs · store.mjs (Blobs) · view.mjs (états public/privé)
netlify/functions state.mjs (GET /api/state) · join.mjs · pick.mjs · team.mjs · host.mjs
public/           index.html + player.js (joueur) · host.html + host.js (hôte) · map.js (carte SVG partagée) · i18n.js (langues) · app.css
scripts/          simulate.mjs · e2e.mjs · load.mjs
tests/            data / engine / roles / api (.test.mjs) · memstore.mjs (Blobs en mémoire)
```

### Clés Blobs (une seule source d'écriture par clé)

| Clé | Écrite par |
|---|---|
| `game` | actions hôte uniquement (dont la résolution du tour) |
| `players/<gameId>/<pid>` | le joueur `<pid>` (inscription) |
| `picks/<gameId>/<turn>/<team>/<role>` | le ou les titulaires du rôle (le dernier choix compte) |
| `team/<gameId>/<turn>/<team>/president` · `…/voice` | le président · la Voix du peuple |
| `offers/<gameId>/<turn>/<from>-<to>` | le diplomate de l'équipe qui propose |
| `offers/<gameId>/<turn>/reply/<from>-<to>` | le diplomate de l'équipe qui répond |

`gameId` change à chaque Reset. `/api/state` ne renvoie jamais les mains ni les choix des autres équipes avant le reveal (testé).

---

## 7. Équilibrage (`npm run simulate`, 1000 parties)

| Objectif (§11) | Résultat |
|---|---|
| Victoires par pays entre 10 % et 30 % | 🇺🇸 12,5 % · 🇫🇷 20,4 % · 🇸🇪 20,4 % · 🇨🇳 22,7 % · 🇧🇷 24,0 % ✅ |
| Zone moyenne du vainqueur entre 6 et 10 | 6,4 pays ✅ |
| Game over planète entre 20 % et 40 % | 23,5 % ✅ |
| Changements d'owner par tour ≥ 3 | 5,1 (4,1 dès le tour 1) ✅ |
| Rejets culturels par partie ≈ 1 | 0,6 ✅ |
| Objectifs secrets réussis (ajout) | 25 à 55 % selon l'objectif ; l'objectif change le vainqueur dans ~26 % des parties |

Constantes finales (en haut de `engine.mjs`) : seuil d'owner 4 · écart 0,5 · érosion 0,9 · seuil de rejet 5 · pénalité de rejet 0,7 (dès 3) · seuils planète **20 / 17 / 5** · diviseurs 5 / 5 · **réchauffement 2**.

Avec les valeurs de la spec, le Brésil gagnait 70 % des parties et la planète ne perdait quasiment jamais (0,1 % de game over) : la pioche Écologie est très positive pour 🌍 et chaque équipe y joue une carte par tour. Les seuls réglages de constantes n'y suffisaient pas, j'ai donc aussi retouché quelques données (voir ci-dessous). J'ai aussi simulé des joueurs qui choisissent au hasard : 35 % de game over à la fin, et seulement 2 % de parties arrêtées avant 2050. C'est pour cette raison que le seuil de game over immédiat est passé de 10 à 5 : une classe distraite ne doit pas voir la partie s'arrêter au tour 3.

---

## 8. Écarts par rapport à la spec et choix faits quand la spec ne précisait pas

**Équilibrage (validé par le simulateur)**
- **Nouvelle règle « Business as usual »** : chaque pays perd 🌍 2 à chaque tour (constante `WARMING`). Elle est annoncée sur la une et dans l'écran joueur. Sans elle, la planète était systématiquement sauvée.
- Seuils planète : bandeau d'alerte sous **20** (spec : 18), game over final sous **17** (spec : 15), game over immédiat sous **5** (spec : 10). Le thermomètre affiche les seuils réels.
- Jauges de départ (éco/planète/bonheur/cohésion) : USA 8/3/6/6 (spec 8/2/5/4), France 6/5/7/6 (6/5/7/4), Suède 5/6/7/6 (5/6/7/7), Chine 7/3/3/4 (7/3/3/5), Brésil 4/7/5/4 (4/8/6/4). La planète commune de départ reste 24.
- Carte : liaisons **ajoutées** USA–Colombie et Brésil–Mexique, **retirées** Brésil–Nigeria et Brésil–Afrique du Sud. Besoin de l'**Australie** : `tech` au lieu de `climat`. L'Amérique du Sud et l'Afrique australe formaient un « jardin » quasi exclusif du Brésil. Chaque pays d'équipe garde au moins 4 voisins (testé).

**Règles**
- Un pays déjà dans la zone d'une équipe reste éligible pour elle même s'il n'est pas voisin (cas de Hollywood sur un pays lointain).
- Le ×1,5 du Sommet 2050 s'applique aux gains passifs.
- Les cartes Culture n'ont pas de tags (la spec n'en donne pas). Les cartes Président non plus.
- Les bots répondent aux offres selon la règle du §9, mais n'en envoient pas. Ils n'opposent jamais de veto et ne font jamais grève (les deux styles).
- Un retardataire qui tombe dans une équipe bot reçoit les 6 rôles, et l'équipe cesse d'être un bot. Sinon, il devient co-titulaire d'un rôle, dans l'ordre culture, eco, ecolo, president, voice, diplomat.
- « Diplomat of the year » compte les accords signés (envoyés ou acceptés). « Biggest polluter » est l'équipe dont la jauge 🌍 finale est la plus basse. « Backlash champion » se départage, à défaut de rejet culturel, par le rejet accumulé.
- Les gros titres « pause café ☕ » ne concernent que les équipes humaines. Quand il y a moins de 5 gros titres, ils sont complétés par une ligne de statut par équipe.
- **Tolérance de 2,5 s** après la fin de Decide : un choix envoyé juste avant la fin mais traité juste après (wifi chargé) est accepté.
- La couleur USA est `#E8743B`, comme le précise le §4.

**Ajouts demandés après la spec**
- Objectifs secrets (+`OBJ_BONUS` = 2 points au classement final), badge ⭐ Conseil aux tours 1-2, « Pourquoi ? » après chaque révélation, pays qui peuvent basculer, rejeu final, sons sur l'écran hôte. Le classement final = pays de la zone + bonus d'objectif (la spec : pays de la zone seulement).

**Technique**
- Les joueurs sont stockés sous `players/<gameId>/<pid>` (et non `players/<pid>`), pour qu'un Reset reparte vraiment de zéro. Les réponses aux offres sont sous `offers/<gameId>/<turn>/reply/<from>-<to>` : en local, une clé ne peut pas être aussi un « dossier ». Il n'y a pas de clé `…/diplomat` séparée, les clés d'offres suffisent.
- Les données statiques (cartes, pays, textes) sont servies par `GET /api/state?static=1`, pour garder une source unique (`data.mjs`) sans build.
- Les coordonnées des pays sont étirées pour remplir le `viewBox` (sans chevauchement). Les deux routes maritimes (USA–Japon, Chili–Australie) sont dessinées comme des routes qui sortent par les bords de la carte, avec le drapeau de destination.
- Au reveal, l'hôte affiche les deltas de jauges dans chaque panneau d'équipe plutôt que dans un encadré, pour ne pas masquer la carte.
- Pour le ciblage Culture sur téléphone, la mini-carte zoome sur les pays éligibles et une liste de boutons (≥ 44 px) la complète.
- Langues : français par défaut (la spec prévoyait l'interface en anglais avec un objet `TEXT` prêt à traduire). Le module partagé `public/i18n.js` construit les données dans la langue choisie. Deux noms de pays sont abrégés sur la carte en français (« Roy.-Uni », « Corée S. ») pour ne pas chevaucher les tuiles voisines.
- Fichiers ajoutés à l'arborescence de la spec : `public/i18n.js`, `tests/data.test.mjs`, `tests/memstore.mjs`, `scripts/e2e.mjs`, `scripts/load.mjs`, `public/map-demo.html`, `.gitignore`.
