# Soft Power 2050

Jeu multijoueur en équipes (≈ 30 min) pour clore l'atelier « La crise d'un modèle : quels horizons… après l'American Way of Life ».

- Écran joueur : `/` · Écran hôte : `/host.html`
- Stack : HTML/CSS/JS vanilla (`public/`), Netlify Functions v2 (`netlify/functions/`), Netlify Blobs.
- Tests : `npm test` · Équilibrage : `npm run simulate`

(README complet à venir.)

## Équilibrage (résultats de `npm run simulate`, 1000 parties de bots)

| Objectif (§11) | Résultat |
|---|---|
| Taux de victoire par pays entre 10 % et 30 % | 🇺🇸 12,1 % · 🇫🇷 21,0 % · 🇸🇪 18,5 % · 🇨🇳 23,8 % · 🇧🇷 24,6 % ✅ |
| Zone moyenne du vainqueur entre 6 et 10 | 6,4 pays ✅ |
| Game over planète entre 20 % et 40 % | 24,2 % ✅ |
| Changements d'owner par tour ≥ 3 | 5,2 (4,1 dès le tour 1) ✅ |
| Rejets culturels par partie ≈ 1 | 0,56 ✅ |

Avec les valeurs de la spec, le Brésil gagnait 70 % des parties et la planète ne perdait quasiment jamais (0,1 %) : la pioche Écologie est très positive pour 🌍 et chaque équipe y joue une carte par tour. Changements appliqués (détails plus bas dans « Écarts par rapport à la spec ») : un réchauffement de −2 🌍 par équipe et par tour, des seuils planète à 20/17, des jauges de départ et quelques liaisons de carte retouchées.
