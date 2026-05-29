/**
 * Application principale - Réseau Ventilation Pro
 * Gère la logique globale, les événements et la communication entre modules
 */

class VentilationApp {
    constructor() {
        // Modules
        this.tableurModule = window.tableurModule;
        this.dessinModule = window.dessinModule;
        
        // État de l'application
        this.currentVolet = 'tableur';
        this.currentProject = null;
        this.currentProjectPath = null;
        this.isModified = false;
        
        // Configuration globale
        this.config = {
            speeds: {
                habitation: 4.0,
                combles: 6.0,
                bureaux: 5.0,
                industriel: 8.0,
                global: 4.0
            },
            material: 'acier_galvanise',
            rho: 1.2,
            lambda: 0.02
        };
        
        // Références DOM
        this.dom = {};
    }
    
    async init() {
        console.log('Initialisation de l\'application...');
        
        // Cache des références DOM
        this.cacheDOMElements();
        
        // Initialiser les modules
        try {
            await this.tableurModule.init();
            await this.dessinModule.init();
        } catch (error) {
            console.error('Erreur initialisation des modules:', error);
            this.showMessage('Erreur', 'Erreur lors de l\'initialisation des modules');
        }
        
        // Attacher les événements globaux
        this.attachGlobalEvents();
        
        // Charger les préférences
        this.loadPreferences();
        
        // Mettre à jour l'interface
        this.updateUI();
        
        // Écouter les événements IPC
        this.setupIPCEvents();
        
        console.log('Application initialisée avec succès');
    }
    
    cacheDOMElements() {
        // Barre de statut
        this.dom.statusBar = {
            currentVolet: document.getElementById('current-volet'),
            message: document.getElementById('status-message'),
            project: document.getElementById('project-status')
        };
        
        // Boutons de la barre d'outils
        this.dom.toolbar = {
            new: document.getElementById('btn-new'),
            open: document.getElementById('btn-open'),
            save: document.getElementById('btn-save'),
            tableur: document.getElementById('btn-volet-tableur'),
            dessin: document.getElementById('btn-volet-dessin'),
            calculate: document.getElementById('btn-calculate'),
            check: document.getElementById('btn-check'),
            exportCsv: document.getElementById('btn-export-csv'),
            exportPdf: document.getElementById('btn-export-pdf'),
            exportDxf: document.getElementById('btn-export-dxf'),
            exportJson: document.getElementById('btn-export-json'),
            importCsv: document.getElementById('btn-import-csv'),
            help: document.getElementById('btn-help'),
            settings: document.getElementById('btn-settings')
        };
        
        // Volets
        this.dom.volets = {
            tableur: document.getElementById('volet-tableur'),
            dessin: document.getElementById('volet-dessin')
        };
        
        // Modales
        this.dom.modals = {
            about: document.getElementById('modal-about'),
            confirm: document.getElementById('modal-confirm'),
            message: document.getElementById('modal-message'),
            settings: document.getElementById('modal-settings')
        };
        
        // Boutons des modales
        this.dom.modalButtons = {
            aboutClose: document.getElementById('modal-about-close'),
            confirmYes: document.getElementById('confirm-yes'),
            confirmNo: document.getElementById('confirm-no'),
            messageOk: document.getElementById('message-ok'),
            settingsSave: document.getElementById('settings-save'),
            settingsCancel: document.getElementById('settings-cancel'),
            settingsDefaults: document.getElementById('settings-defaults')
        };
        
        // Panneau des propriétés
        this.dom.properties = {
            panel: document.getElementById('properties-panel')
        };
        
        // Overlay de chargement
        this.dom.loading = document.getElementById('loading-overlay');
    }
    
    attachGlobalEvents() {
        // Navigation entre volets
        this.dom.toolbar.tableur.addEventListener('click', () => this.showVolet('tableur'));
        this.dom.toolbar.dessin.addEventListener('click', () => this.showVolet('dessin'));
        
        // Nouveau projet
        this.dom.toolbar.new.addEventListener('click', () => this.newProject());
        
        // Ouvrir projet
        this.dom.toolbar.open.addEventListener('click', () => this.openProject());
        
        // Enregistrer projet
        this.dom.toolbar.save.addEventListener('click', () => this.saveProject());
        
        // Calculer tout
        this.dom.toolbar.calculate.addEventListener('click', () => this.calculateAll());
        
        // Vérifier cohérence
        this.dom.toolbar.check.addEventListener('click', () => this.checkConsistency());
        
        // Export
        this.dom.toolbar.exportCsv.addEventListener('click', () => this.exportCSV());
        this.dom.toolbar.exportPdf.addEventListener('click', () => this.exportPDF());
        this.dom.toolbar.exportDxf.addEventListener('click', () => this.exportDXF());
        this.dom.toolbar.exportJson.addEventListener('click', () => this.exportJSON());
        
        // Import
        this.dom.toolbar.importCsv.addEventListener('click', () => this.importCSV());
        
        // Aide
        this.dom.toolbar.help.addEventListener('click', () => this.showAbout());
        
        // Préférences
        this.dom.toolbar.settings.addEventListener('click', () => this.showSettings());
        
        // Boutons des modales
        this.dom.modalButtons.aboutClose.addEventListener('click', () => this.hideModal('about'));
        this.dom.modalButtons.confirmYes.addEventListener('click', () => this.confirmAction(true));
        this.dom.modalButtons.confirmNo.addEventListener('click', () => this.confirmAction(false));
        this.dom.modalButtons.messageOk.addEventListener('click', () => this.hideModal('message'));
        this.dom.modalButtons.settingsSave.addEventListener('click', () => this.saveSettings());
        this.dom.modalButtons.settingsCancel.addEventListener('click', () => this.hideModal('settings'));
        this.dom.modalButtons.settingsDefaults.addEventListener('click', () => this.resetSettings());
        
        // Fermeture des modales via le bouton X
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) modal.classList.remove('active');
            });
        });
        
        // Fermer les modales en cliquant à l'extérieur
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
        
        // Raccourcis clavier
        this.attachKeyboardShortcuts();
        
        // Gestion de la fermeture de la fenêtre
        window.addEventListener('beforeunload', (e) => {
            if (this.isModified) {
                e.preventDefault();
                e.returnValue = 'Vous avez des modifications non enregistrées. Voulez-vous vraiment quitter ?';
            }
        });
    }
    
    attachKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl + S
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveProject();
            }
            
            // Ctrl + O
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                this.openProject();
            }
            
            // Ctrl + N
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.newProject();
            }
            
            // Ctrl + 1
            if (e.ctrlKey && e.key === '1') {
                e.preventDefault();
                this.showVolet('tableur');
            }
            
            // Ctrl + 2
            if (e.ctrlKey && e.key === '2') {
                e.preventDefault();
                this.showVolet('dessin');
            }
            
            // Tab
            if (e.key === 'Tab' && !e.target.matches('input, select, textarea')) {
                e.preventDefault();
                this.toggleVolet();
            }
            
            // F5
            if (e.key === 'F5') {
                e.preventDefault();
                this.calculateAll();
            }
            
            // F6
            if (e.key === 'F6') {
                e.preventDefault();
                this.checkConsistency();
            }
        });
    }
    
    setupIPCEvents() {
        // Écouter les événements du menu
        window.electronAPI.on('new-project', () => this.newProject());
        window.electronAPI.on('open-project', () => this.openProject());
        window.electronAPI.on('save-project', () => this.saveProject());
        window.electronAPI.on('save-as-project', () => this.saveProject(true));
        window.electronAPI.on('export-csv', () => this.exportCSV());
        window.electronAPI.on('export-pdf', () => this.exportPDF());
        window.electronAPI.on('export-dxf', () => this.exportDXF());
        window.electronAPI.on('export-json', () => this.exportJSON());
        window.electronAPI.on('import-csv', () => this.importCSV());
        window.electronAPI.on('show-volet', (volet) => this.showVolet(volet));
        window.electronAPI.on('toggle-volet', () => this.toggleVolet());
        window.electronAPI.on('calculate-all', () => this.calculateAll());
        window.electronAPI.on('check-consistency', () => this.checkConsistency());
        window.electronAPI.on('show-help', () => this.showAbout());
        window.electronAPI.on('show-settings', () => this.showSettings());
        window.electronAPI.on('show-about', () => this.showAbout());
    }
    
    showVolet(volet) {
        if (this.currentVolet === volet) return;
        
        // Sauvegarder l'état du volet actuel si nécessaire
        
        // Changer de volet
        this.dom.volets.tableur.classList.remove('active');
        this.dom.volets.dessin.classList.remove('active');
        
        this.dom.toolbar.tableur.classList.remove('active');
        this.dom.toolbar.dessin.classList.remove('active');
        
        this.currentVolet = volet;
        
        if (volet === 'tableur') {
            this.dom.volets.tableur.classList.add('active');
            this.dom.toolbar.tableur.classList.add('active');
        } else if (volet === 'dessin') {
            this.dom.volets.dessin.classList.add('active');
            this.dom.toolbar.dessin.classList.add('active');
        }
        
        // Mettre à jour la barre de statut
        this.dom.statusBar.currentVolet.textContent = `Volet ${volet === 'tableur' ? '1' : '2'} - ${volet.charAt(0).toUpperCase() + volet.slice(1)}`;
    }
    
    toggleVolet() {
        const nextVolet = this.currentVolet === 'tableur' ? 'dessin' : 'tableur';
        this.showVolet(nextVolet);
    }
    
    async newProject() {
        if (this.isModified) {
            const result = await this.showConfirm(
                'Nouveau projet',
                'Vous avez des modifications non enregistrées. Voulez-vous vraiment créer un nouveau projet ?'
            );
            
            if (!result) return;
        }
        
        // Réinitialiser les modules
        this.tableurModule.clearAll();
        this.dessinModule.clearAll();
        
        this.currentProject = null;
        this.currentProjectPath = null;
        this.isModified = false;
        
        this.updateUI();
        this.showVolet('tableur');
    }
    
    async openProject() {
        try {
            const result = await window.electronAPI.openProject();
            
            if (result && result.success) {
                this.loadProject(result.data, result.path);
            }
        } catch (error) {
            console.error('Erreur ouverture projet:', error);
            this.showMessage('Erreur', 'Erreur lors de l\'ouverture du projet');
        }
    }
    
    loadProject(data, path) {
        try {
            // Charger les données dans les modules
            if (data.type === 'tableur') {
                this.tableurModule.setData(data.data);
                this.showVolet('tableur');
            } else if (data.type === 'dessin') {
                // Pour l'instant, on charge juste les données brutes
                // Une implémentation plus complète chargera dans le module dessin
                console.log('Chargement du dessin:', data);
                this.showVolet('dessin');
            } else if (data.tableur && data.dessin) {
                if (data.tableur) this.tableurModule.setData(data.tableur);
                // Charger le dessin si implémenté
            } else {
                // Format inconnu, essayer de charger dans le tableur
                this.tableurModule.setData(data);
            }
            
            this.currentProject = data;
            this.currentProjectPath = path;
            this.isModified = false;
            
            this.updateUI();
            
        } catch (error) {
            console.error('Erreur chargement projet:', error);
            this.showMessage('Erreur', 'Erreur lors du chargement du projet');
        }
    }
    
    async saveProject(forceSaveAs = false) {
        try {
            let dataToSave = this.getProjectData();
            
            if (forceSaveAs || !this.currentProjectPath) {
                // Sauvegarder sous...
                const result = await window.electronAPI.saveProject(dataToSave);
                if (result && result.success) {
                    this.currentProjectPath = result.path;
                    this.isModified = false;
                    this.updateUI();
                }
            } else {
                // Sauvegarder
                const result = await window.electronAPI.saveProject(dataToSave, this.currentProjectPath);
                if (result && result.success) {
                    this.isModified = false;
                    this.updateUI();
                }
            }
        } catch (error) {
            console.error('Erreur sauvegarde projet:', error);
            this.showMessage('Erreur', 'Erreur lors de la sauvegarde du projet');
        }
    }
    
    getProjectData() {
        // Récupérer les données des deux modules
        const tableurData = this.tableurModule.exportToJSON();
        const dessinData = this.dessinModule.exportToJSON();
        
        return {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            tableur: tableurData,
            dessin: dessinData,
            config: this.config
        };
    }
    
    calculateAll() {
        // Calculer dans le module tableur
        this.tableurModule.calculateAll();
        
        // Calculer dans le module dessin
        this.dessinModule.calculateAll();
        
        this.showStatusMessage('Calculs terminés', 'success');
    }
    
    checkConsistency() {
        // Vérifier le tableur
        const tableurData = this.tableurModule.getData();
        const tableurErrors = [];
        
        tableurData.forEach(row => {
            if (!row.debit || row.debit <= 0) {
                tableurErrors.push(`Ligne ${row.id}: débit invalide`);
            }
        });
        
        // Vérifier le dessin
        const dessinResult = this.dessinModule.checkConsistency();
        
        const allErrors = [...tableurErrors, ...dessinResult.errors];
        
        if (allErrors.length === 0) {
            this.showStatusMessage('Réseau cohérent', 'success');
            this.showMessage('Vérification', 'Le réseau est cohérent. Aucune erreur détectée.');
        } else {
            this.showStatusMessage(`${allErrors.length} erreur(s) détectée(s)`, 'error');
            this.showMessage('Erreurs détectées', allErrors.join('\n'));
        }
    }
    
    async exportCSV() {
        try {
            const data = this.tableurModule.exportToCSV();
            const timestamp = new Date().toISOString().slice(0, 10);
            const fileName = `tableur_ventilation_${timestamp}.csv`;
            
            const result = await window.electronAPI.exportCsv(data, fileName);
            
            if (result && result.success) {
                this.showStatusMessage(`CSV exporté: ${result.path}`, 'success');
            }
        } catch (error) {
            console.error('Erreur export CSV:', error);
            this.showMessage('Erreur', 'Erreur lors de l\'export CSV');
        }
    }
    
    async exportPDF() {
        try {
            const timestamp = new Date().toISOString().slice(0, 10);
            const fileName = `schema_ventilation_${timestamp}.pdf`;
            
            // Utiliser html2canvas et jsPDF
            this.showLoading();
            
            let elementToCapture;
            if (this.currentVolet === 'tableur') {
                elementToCapture = document.getElementById('volet-tableur');
            } else {
                elementToCapture = document.getElementById('volet-dessin');
            }
            
            const canvas = await html2canvas(elementToCapture, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true
            });
            
            const imgData = canvas.toDataURL('image/png');
            
            const jsPDF = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'mm'
            });
            
            const imgWidth = pdf.internal.pageSize.getWidth();
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            
            // Ajouter un en-tête
            pdf.setFontSize(16);
            pdf.text('Réseau Ventilation Pro - NF DTU 65.14', imgWidth / 2, 10, { align: 'center' });
            pdf.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, imgWidth / 2, 18, { align: 'center' });
            
            // Ajouter un tableau récapitulatif
            if (this.currentVolet === 'tableur') {
                this.addTableurSummaryToPDF(pdf, imgHeight + 20);
            } else {
                this.addDessinSummaryToPDF(pdf, imgHeight + 20);
            }
            
            this.hideLoading();
            
            // Sauvegarder le PDF
            pdf.save(fileName);
            
            this.showStatusMessage(`PDF exporté: ${fileName}`, 'success');
            
        } catch (error) {
            console.error('Erreur export PDF:', error);
            this.hideLoading();
            this.showMessage('Erreur', 'Erreur lors de l\'export PDF');
        }
    }
    
    addTableurSummaryToPDF(pdf, startY) {
        const data = this.tableurModule.getData();
        
        pdf.setFontSize(14);
        pdf.text('Tableau récapitulatif', 10, startY);
        
        startY += 10;
        
        // En-têtes
        const headers = ['ID', 'Nom', 'Débit (m³/h)', 'Diamètre (mm)', 'Vitesse (m/s)', 'Pertes (Pa/m)', 'Longueur (m)'];
        const colWidths = [15, 30, 25, 25, 25, 25, 25];
        
        let x = 10;
        pdf.setFontSize(10);
        headers.forEach((header, i) => {
            pdf.text(header, x, startY);
            x += colWidths[i];
        });
        
        startY += 8;
        
        // Données
        data.forEach(row => {
            x = 10;
            const values = [
                row.id || '',
                row.nom || '',
                row.debit ? row.debit.toFixed(0) : '',
                row.diametre || '',
                row.vitesseReelle || '',
                row.pertesCharge || '',
                row.longueur || ''
            ];
            
            values.forEach((value, i) => {
                pdf.text(value.toString(), x, startY);
                x += colWidths[i];
            });
            
            startY += 6;
            
            if (startY > 180) {
                pdf.addPage();
                startY = 20;
            }
        });
    }
    
    addDessinSummaryToPDF(pdf, startY) {
        pdf.setFontSize(14);
        pdf.text('Résumé du réseau', 10, startY);
        
        startY += 10;
        pdf.setFontSize(10);
        
        const elements = this.dessinModule.elements;
        const troncons = this.dessinModule.troncons;
        
        const summary = [
            `Nombre d'éléments: ${elements.length}`,
            `Nombre de tronçons: ${troncons.length}`,
            `Total débit: ${elements.reduce((sum, el) => sum + (el.debit || 0), 0)} m³/h`
        ];
        
        summary.forEach(text => {
            pdf.text(text, 10, startY);
            startY += 8;
        });
    }
    
    async exportDXF() {
        try {
            const dxfContent = this.dessinModule.exportToDXF();
            const timestamp = new Date().toISOString().slice(0, 10);
            const fileName = `reseau_ventilation_${timestamp}.dxf`;
            
            const result = await window.electronAPI.exportDxf(dxfContent, fileName);
            
            if (result && result.success) {
                this.showStatusMessage(`DXF exporté: ${result.path}`, 'success');
            }
        } catch (error) {
            console.error('Erreur export DXF:', error);
            this.showMessage('Erreur', 'Erreur lors de l\'export DXF');
        }
    }
    
    async exportJSON() {
        try {
            const data = this.getProjectData();
            const timestamp = new Date().toISOString().slice(0, 10);
            const fileName = `projet_ventilation_${timestamp}.json`;
            
            const result = await window.electronAPI.exportJson(data, fileName);
            
            if (result && result.success) {
                this.showStatusMessage(`JSON exporté: ${result.path}`, 'success');
            }
        } catch (error) {
            console.error('Erreur export JSON:', error);
            this.showMessage('Erreur', 'Erreur lors de l\'export JSON');
        }
    }
    
    async importCSV() {
        try {
            const result = await window.electronAPI.importCsv();
            
            if (result && result.success) {
                // Parser le CSV (format simple)
                const content = result.content;
                const lines = content.split('\n');
                
                const data = [];
                const headers = lines[0].split(';');
                
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === '') continue;
                    
                    const values = lines[i].split(';');
                    const row = {};
                    
                    headers.forEach((header, j) => {
                        const cleanHeader = header.trim();
                        const cleanValue = values[j] ? values[j].trim() : '';
                        
                        if (cleanHeader === 'Débit (m³/h)' || cleanHeader === 'debit') {
                            row.debit = parseFloat(cleanValue.replace(',', '.')) || 0;
                        } else if (cleanHeader === 'Vitesse max (m/s)' || cleanHeader === 'vitesseMax') {
                            row.vitesseMax = parseFloat(cleanValue.replace(',', '.')) || null;
                        } else if (cleanHeader === 'Diamètre (mm)' || cleanHeader === 'diametre') {
                            row.diametre = parseInt(cleanValue) || null;
                        } else if (cleanHeader === 'Longueur (m)' || cleanHeader === 'longueur') {
                            row.longueur = parseFloat(cleanValue.replace(',', '.')) || 0;
                        } else if (cleanHeader === 'Nom' || cleanHeader === 'nom') {
                            row.nom = cleanValue;
                        } else if (cleanHeader === 'ID' || cleanHeader === 'id') {
                            row.id = parseInt(cleanValue) || null;
                        }
                    });
                    
                    if (row.debit) {
                        data.push(row);
                    }
                }
                
                if (data.length > 0) {
                    this.tableurModule.setData(data);
                    this.showVolet('tableur');
                    this.showStatusMessage(`${data.length} lignes importées`, 'success');
                } else {
                    this.showMessage('Avertissement', 'Aucune donnée valide trouvée dans le fichier CSV');
                }
            }
        } catch (error) {
            console.error('Erreur import CSV:', error);
            this.showMessage('Erreur', 'Erreur lors de l\'import CSV');
        }
    }
    
    showAbout() {
        this.showModal('about');
    }
    
    showSettings() {
        // Charger les valeurs actuelles
        document.getElementById('setting-vitesse-habitation').value = this.config.speeds.habitation;
        document.getElementById('setting-vitesse-combles').value = this.config.speeds.combles;
        document.getElementById('setting-vitesse-bureaux').value = this.config.speeds.bureaux;
        document.getElementById('setting-vitesse-industriel').value = this.config.speeds.industriel;
        document.getElementById('setting-vitesse-global').value = this.config.speeds.global;
        document.getElementById('setting-rho').value = this.config.rho;
        document.getElementById('setting-lambda').value = this.config.lambda;
        
        this.showModal('settings');
    }
    
    saveSettings() {
        this.config.speeds.habitation = parseFloat(document.getElementById('setting-vitesse-habitation').value) || 4.0;
        this.config.speeds.combles = parseFloat(document.getElementById('setting-vitesse-combles').value) || 6.0;
        this.config.speeds.bureaux = parseFloat(document.getElementById('setting-vitesse-bureaux').value) || 5.0;
        this.config.speeds.industriel = parseFloat(document.getElementById('setting-vitesse-industriel').value) || 8.0;
        this.config.speeds.global = parseFloat(document.getElementById('setting-vitesse-global').value) || 4.0;
        this.config.rho = parseFloat(document.getElementById('setting-rho').value) || 1.2;
        this.config.lambda = parseFloat(document.getElementById('setting-lambda').value) || 0.02;
        
        // Sauvegarder dans localStorage
        this.savePreferences();
        
        // Appliquer les nouveaux paramètres
        this.tableurModule.config.vitesseMax = this.config.speeds.global;
        this.tableurModule.config.lambda = this.config.lambda;
        this.tableurModule.config.rho = this.config.rho;
        this.tableurModule.calculateAll();
        
        this.dessinModule.config.lambda = this.config.lambda;
        this.dessinModule.config.rho = this.config.rho;
        
        this.hideModal('settings');
        this.showStatusMessage('Préférences enregistrées', 'success');
    }
    
    resetSettings() {
        this.config = {
            speeds: {
                habitation: 4.0,
                combles: 6.0,
                bureaux: 5.0,
                industriel: 8.0,
                global: 4.0
            },
            material: 'acier_galvanise',
            rho: 1.2,
            lambda: 0.02
        };
        
        // Mettre à jour l'interface
        document.getElementById('setting-vitesse-habitation').value = 4.0;
        document.getElementById('setting-vitesse-combles').value = 6.0;
        document.getElementById('setting-vitesse-bureaux').value = 5.0;
        document.getElementById('setting-vitesse-industriel').value = 8.0;
        document.getElementById('setting-vitesse-global').value = 4.0;
        document.getElementById('setting-rho').value = 1.2;
        document.getElementById('setting-lambda').value = 0.02;
        
        this.showStatusMessage('Préférences réinitialisées', 'warning');
    }
    
    loadPreferences() {
        const saved = localStorage.getItem('ventilationAppPreferences');
        if (saved) {
            try {
                const prefs = JSON.parse(saved);
                this.config = { ...this.config, ...prefs };
                
                // Appliquer aux modules
                this.tableurModule.config.vitesseMax = this.config.speeds.global;
                this.tableurModule.config.lambda = this.config.lambda;
                this.tableurModule.config.rho = this.config.rho;
            } catch (error) {
                console.error('Erreur chargement préférences:', error);
            }
        }
    }
    
    savePreferences() {
        localStorage.setItem('ventilationAppPreferences', JSON.stringify(this.config));
    }
    
    showModal(modalName) {
        const modal = this.dom.modals[modalName];
        if (modal) {
            modal.classList.add('active');
        }
    }
    
    hideModal(modalName) {
        const modal = this.dom.modals[modalName];
        if (modal) {
            modal.classList.remove('active');
        }
    }
    
    async showConfirm(title, message) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        this.showModal('confirm');
        
        // Attendre la réponse
        return new Promise((resolve) => {
            const handler = (result) => {
                this.hideModal('confirm');
                resolve(result);
                // Retirer le handler
                this.confirmResolver = null;
            };
            this.confirmResolver = handler;
        });
    }
    
    confirmAction(confirmed) {
        if (this.confirmResolver) {
            this.confirmResolver(confirmed);
        }
    }
    
    showMessage(title, message) {
        document.getElementById('message-title').textContent = title;
        document.getElementById('message-text').textContent = message;
        this.showModal('message');
    }
    
    showStatusMessage(message, type = '') {
        this.dom.statusBar.message.textContent = message;
        this.dom.statusBar.message.className = type ? `status-${type}` : '';
        
        // Effacer après 5 secondes
        setTimeout(() => {
            if (this.dom.statusBar.message.textContent === message) {
                this.dom.statusBar.message.textContent = '';
                this.dom.statusBar.message.className = '';
            }
        }, 5000);
    }
    
    showLoading() {
        this.dom.loading.classList.remove('hidden');
    }
    
    hideLoading() {
        this.dom.loading.classList.add('hidden');
    }
    
    updateUI() {
        // Mettre à jour l'état du projet
        if (this.currentProjectPath) {
            const fileName = this.currentProjectPath.split('\\').pop().split('/').pop();
            this.dom.statusBar.project.textContent = fileName;
        } else {
            this.dom.statusBar.project.textContent = 'Aucun projet';
        }
        
        // Mettre à jour l'état des boutons
        this.dom.toolbar.save.disabled = !this.isModified;
    }
}

// Initialiser l'application lorsque le DOM est chargé
document.addEventListener('DOMContentLoaded', async () => {
    // Attendre que Handsontable et Fabric.js soient chargés
    await new Promise(resolve => {
        const checkLoaded = () => {
            if (typeof Handsontable !== 'undefined' && typeof fabric !== 'undefined') {
                resolve();
            } else {
                setTimeout(checkLoaded, 100);
            }
        };
        checkLoaded();
    });
    
    const app = new VentilationApp();
    window.ventilationApp = app;
    await app.init();
});
