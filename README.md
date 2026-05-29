# Réseau Ventilation Pro

Application de calcul et dessin de réseaux de ventilation conforme aux normes françaises **NF DTU 65.14**.

## Fonctionnalités

### Volet 1 - Tableur
- Calcul automatique des diamètres selon NF DTU 65.14
- Calcul des vitesses réelles et pertes de charge linéaires
- Support des diamètres commerciaux français : [80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000] mm
- Vitesses maximales paramétrables (habitations: 4 m/s, combles: 6 m/s, etc.)
- Export CSV et JSON

### Volet 2 - Dessin
- Dessin interactif du réseau de ventilation
- Éléments disponibles : gaines, bouches, caissons, jonctions (T, Y), coudes
- Calcul automatique des diamètres pour chaque tronçon
- Calcul des pertes de charge (linéaires + singularités)
- Export PDF et DXF

### Interface
- Barre d'outils complète avec boutons et raccourcis clavier
- Barre de statut avec messages en temps réel
- Panneau de propriétés pour éditer les éléments
- Vérification de cohérence du réseau

## Prérequis

- Node.js 18+ (recommandé: 20+)
- npm ou yarn

## Installation

```bash
# Cloner le dépôt (si applicable)
# ou copier ce dossier

# Installer les dépendances
npm install

# Démarrer l'application en mode développement
npm run dev

# Construire l'application
npm run build

# Construire pour Windows ( portable )
npm run build:win
```

## Structure du projet

```
app-reseau-ventilation/
├── package.json           # Configuration Electron et dépendances
├── main.js               # Processus principal Electron
├── preload.js            # Préchargeur pour sécurité Electron
├── renderer/
│   ├── index.html        # Page HTML principale
│   ├── styles.css        # Styles CSS
│   ├── app.js            # Logique principale de l'application
│   ├── modules/
│   │   ├── tableur.js    # Module tableur (Volet 1)
│   │   └── dessin.js     # Module dessin (Volet 2)
│   └── config/
│       ├── diametres_nf.json   # Diamètres commerciaux NF DTU 65.14
│       ├── singularites.json    # Coefficients K des singularités
│       └── defaults.json        # Paramètres par défaut
├── assets/
│   └── icon.ico          # Icône de l'application
├── exports/              # Dossier pour les exports
└── .gitignore            # Fichiers ignorés par Git
```

## Configuration

### Diamètres NF DTU 65.14

Les diamètres commerciaux sont définis dans `renderer/config/diametres_nf.json` :

```json
{
  "valeurs": [80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000]
}
```

### Vitesses maximales

Les vitesses maximales par défaut sont définies dans `renderer/config/defaults.json` :

```json
{
  "vitesses_max": {
    "habitations": 4.0,
    "combles": 6.0,
    "bureaux": 5.0,
    "industriel": 8.0,
    "global": 4.0
  }
}
```

### Coefficients de pertes de charge

Les coefficients K pour les singularités sont définis dans `renderer/config/singularites.json` :

```json
{
  "coudes": {
    "90_degrees": 0.25,
    "45_degrees": 0.15
  },
  "jonctions": {
    "t_branchement": 0.5,
    "t_droit": 0.3,
    "y_branchement": 0.4
  }
}
```

## Formules

### Diamètre théorique

```
D = sqrt((4 × Q) / (π × V_max))
```

Où :
- D : diamètre (m)
- Q : débit (m³/s) = débit (m³/h) / 3600
- V_max : vitesse maximale (m/s)

### Diamètre commercial

Le premier diamètre de la liste NF supérieur ou égal au diamètre théorique.

### Vitesse réelle

```
V = (4 × Q) / (π × D²)
```

Où :
- V : vitesse réelle (m/s)
- D : diamètre (m)

### Pertes de charge linéaires

```
ΔP/L = λ × (1/D) × (ρ × V²)/2
```

Où :
- ΔP/L : pertes de charge par mètre (Pa/m)
- λ : coefficient de frottement (0.02 pour acier galvanisé)
- D : diamètre (m)
- ρ : masse volumique de l'air (1.2 kg/m³ à 20°C)
- V : vitesse (m/s)

### Pertes de charge singulières

```
ΔP = K × (ρ × V²)/2
```

Où :
- K : coefficient de singularité

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| Ctrl + N | Nouveau projet |
| Ctrl + O | Ouvrir un projet |
| Ctrl + S | Enregistrer |
| Ctrl + 1 | Afficher le tableur |
| Ctrl + 2 | Afficher le dessin |
| Tab | Basculer entre volets |
| F5 | Calculer tout |
| F6 | Vérifier cohérence |

## Technologie

- **Electron** : Framework pour applications desktop
- **Fabric.js** : Bibliothèque de dessin vectoriel sur canvas
- **Handsontable** : Tableur interactif type Excel
- **jsPDF + html2canvas** : Génération de PDF
- **dxf-writer** : Export DXF (optionnel)

## Auteur

Application développée avec Vibe CLI.

## License

MIT
