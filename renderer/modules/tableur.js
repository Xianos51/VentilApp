/**
 * Module Tableur - Volet 1
 * Calcul des diamètres et pertes de charge selon NF DTU 65.14
 */

class TableurModule {
    constructor() {
        this.hot = null;
        this.data = [];
        this.config = {
            diametres: [],
            vitesseMax: 4.0,
            lambda: 0.02,
            rho: 1.2
        };
        this.defaultRow = {
            id: null,
            debit: 500,
            vitesseMax: null,
            diametre: null,
            vitesseReelle: null,
            pertesCharge: null,
            longueur: 5.0,
            nom: ''
        };
        this.nextId = 1;
        this.initialized = false;
    }
    
    async init() {
        console.log('Initialisation du module tableur...');
        await this.loadConfigs();
        this.initHandsontable();
        this.loadDefaultData();
        this.attachEvents();
        this.initialized = true;
    }
    
    async loadConfigs() {
        try {
            const diametres = await window.electronAPI.loadConfig('diametres_nf.json');
            if (diametres && diametres.valeurs) {
                this.config.diametres = diametres.valeurs.sort((a, b) => a - b);
            } else {
                this.config.diametres = [80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000];
            }
            const defaults = await window.electronAPI.loadConfig('defaults.json');
            if (defaults) {
                this.config.vitesseMax = defaults.vitesses_max.global || 4.0;
                this.config.lambda = defaults.materiaux.acier_galvanise.coefficient_frottement || 0.02;
                this.config.rho = defaults.fluide.masse_volumique || 1.2;
            }
            document.getElementById('vitesse-max-global').value = this.config.vitesseMax;
        } catch (error) {
            console.error('Erreur chargement configs:', error);
        }
    }
    
    initHandsontable() {
        const container = document.getElementById('handsontable-container');
        Handsontable.licenseKey = 'non-commercial-and-evaluation';
        
        this.hot = new Handsontable(container, {
            data: this.data,
            colHeaders: [
                'ID',
                'Nom',
                'Débit (m³/h)',
                'Vitesse max (m/s)',
                'Diamètre (mm)',
                'Vitesse réelle (m/s)',
                'Pertes de charge (Pa/m)',
                'Longueur (m)'
            ],
            columns: [
                { data: 'id', type: 'numeric', readOnly: true, width: 50 },
                { data: 'nom', type: 'text', width: 120 },
                { data: 'debit', type: 'numeric', width: 100, readOnly: false },
                { data: 'vitesseMax', type: 'numeric', width: 100, readOnly: false },
                { data: 'diametre', type: 'dropdown', source: this.config.diametres.map(d => d.toString()), width: 100 },
                { data: 'vitesseReelle', type: 'numeric', readOnly: true, width: 100 },
                { data: 'pertesCharge', type: 'numeric', readOnly: true, width: 120 },
                { data: 'longueur', type: 'numeric', width: 80 }
            ],
            rowHeaders: true,
            colWidths: 'auto',
            stretchH: 'all',
            height: '100%',
            contextMenu: true,
            multiSelect: true,
            manualRowResize: true,
            manualColumnResize: true,
            persistentState: true,
            outsideClickDeselects: true,
            enterBeginsEditing: true,
            tabMoves: { row: true, col: true },
            className: 'htCenter htMiddle',
            headerClassName: 'htCenter htMiddle',
            afterChange: (changes, source) => {
                if (source !== 'loadData' && changes) {
                    this.handleDataChange(changes);
                }
            },
            afterRemoveRow: () => {
                this.calculateAll();
                this.updateSummary();
            },
            afterCreateRow: () => {
                this.calculateAll();
                this.updateSummary();
            }
        });
    }
    
    loadDefaultData() {
        const defaultData = [
            { id: 1, debit: 500, vitesseMax: null, diametre: null, vitesseReelle: null, pertesCharge: null, longueur: 5.0, nom: 'Ligne 1' },
            { id: 2, debit: 800, vitesseMax: null, diametre: null, vitesseReelle: null, pertesCharge: null, longueur: 8.0, nom: 'Ligne 2' },
            { id: 3, debit: 1200, vitesseMax: null, diametre: null, vitesseReelle: null, pertesCharge: null, longueur: 10.0, nom: 'Ligne 3' }
        ];
        this.data = defaultData;
        this.nextId = 4;
        if (this.hot) {
            this.hot.loadData(this.data);
            this.calculateAll();
            this.updateSummary();
        }
    }
    
    attachEvents() {
        document.getElementById('tableur-add-row').addEventListener('click', () => this.addRow());
        document.getElementById('tableur-remove-row').addEventListener('click', () => this.removeSelectedRows());
        document.getElementById('tableur-clear').addEventListener('click', () => this.clearAll());
        document.getElementById('tableur-apply-all').addEventListener('click', () => this.applyToAll());
        document.getElementById('vitesse-max-global').addEventListener('change', (e) => {
            this.config.vitesseMax = parseFloat(e.target.value) || 4.0;
            this.applyToAll();
        });
        document.getElementById('materiau-select').addEventListener('change', (e) => this.updateMaterial(e.target.value));
    }
    
    addRow() {
        const newRow = { ...this.defaultRow };
        newRow.id = this.nextId++;
        newRow.nom = `Ligne ${newRow.id}`;
        this.data.push(newRow);
        if (this.hot) {
            this.hot.loadData(this.data);
            this.hot.selectCell(this.data.length - 1, 2);
        }
    }
    
    removeSelectedRows() {
        const selected = this.hot.getSelected();
        if (!selected || selected.length === 0) return;
        const rowsToRemove = [...new Set(selected.map(s => s[0]))].sort((a, b) => b - a);
        rowsToRemove.forEach(row => this.data.splice(row, 1));
        if (this.hot) this.hot.loadData(this.data);
    }
    
    clearAll() {
        this.data = [];
        this.nextId = 1;
        if (this.hot) this.hot.loadData(this.data);
        this.updateSummary();
    }
    
    applyToAll() {
        this.data.forEach(row => row.vitesseMax = row.vitesseMax || this.config.vitesseMax);
        if (this.hot) this.hot.loadData(this.data);
        this.calculateAll();
    }
    
    updateMaterial(materialName) {
        const materials = {
            'acier_galvanise': 0.02,
            'aluminium': 0.018,
            'pvc': 0.015,
            'flexible': 0.025
        };
        this.config.lambda = materials[materialName] || 0.02;
        this.calculateAll();
    }
    
    handleDataChange(changes) {
        changes.forEach(([row, prop, oldVal, newVal]) => {
            if (this.data[row] && prop in this.data[row]) this.data[row][prop] = newVal;
        });
        this.calculateAll();
        this.updateSummary();
    }
    
    calculateAll() {
        if (!this.data || this.data.length === 0) return;
        this.data.forEach(row => {
            const vMax = row.vitesseMax !== null && row.vitesseMax !== '' && !isNaN(row.vitesseMax) ? parseFloat(row.vitesseMax) : this.config.vitesseMax;
            const debit = parseFloat(row.debit) || 0;
            const longueur = parseFloat(row.longueur) || 0;
            const diametreTheorique = this.calculerDiametreTheorique(debit, vMax);
            const diametreCommercial = this.trouverDiametreCommercial(diametreTheorique);
            const vitesseReelle = this.calculerVitesseReelle(debit, diametreCommercial);
            const pertesCharge = this.calculerPertesCharge(vitesseReelle, diametreCommercial, this.config.lambda, this.config.rho);
            row.diametre = diametreCommercial;
            row.vitesseReelle = vitesseReelle.toFixed(2);
            row.pertesCharge = pertesCharge.toFixed(2);
            row.vitesseMax = vMax;
        });
        if (this.hot) this.hot.loadData(this.data);
    }
    
    calculerDiametreTheorique(debit, vitesseMax) {
        const Q = debit / 3600;
        return Math.sqrt((4 * Q) / (Math.PI * vitesseMax));
    }
    
    trouverDiametreCommercial(diametreTheorique) {
        const dTheoriqueMm = diametreTheorique * 1000;
        for (let i = 0; i < this.config.diametres.length; i++) {
            if (this.config.diametres[i] >= dTheoriqueMm) return this.config.diametres[i];
        }
        return this.config.diametres[this.config.diametres.length - 1];
    }
    
    calculerVitesseReelle(debit, diametre) {
        const Q = debit / 3600;
        const D = diametre / 1000;
        return (4 * Q) / (Math.PI * D * D);
    }
    
    calculerPertesCharge(vitesse, diametre, lambda, rho) {
        const D = diametre / 1000;
        return lambda * (1 / D) * (rho * vitesse * vitesse) / 2;
    }
    
    updateSummary() {
        const count = this.data.length;
        let totalDiametre = 0; let totalPertes = 0;
        this.data.forEach(row => {
            totalDiametre += parseFloat(row.diametre) || 0;
            totalPertes += parseFloat(row.pertesCharge) || 0;
        });
        document.getElementById('tableur-row-count').textContent = count;
        document.getElementById('tableur-total-diametre').textContent = `${totalDiametre.toFixed(0)} mm`;
        document.getElementById('tableur-total-pertes').textContent = `${totalPertes.toFixed(2)} Pa`;
    }
    
    getData() { return this.data; }
    
    setData(data) {
        if (data && data.length > 0) {
            const maxId = Math.max(...data.map(row => row.id || 0));
            this.nextId = maxId + 1;
            this.data = data;
            if (this.hot) this.hot.loadData(this.data);
            this.calculateAll();
            this.updateSummary();
        } else {
            this.clearAll();
        }
    }
    
    exportToCSV() { return this.data; }
    
    exportToJSON() {
        return {
            type: 'tableur',
            data: this.data,
            config: { vitesseMax: this.config.vitesseMax, lambda: this.config.lambda, rho: this.config.rho }
        };
    }
}

const tableurModule = new TableurModule();
window.tableurModule = tableurModule;
