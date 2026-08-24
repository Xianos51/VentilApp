/**
 * Module Dessin - Volet 2
 * Dessin interactif du reseau de ventilation avec detection automatique des connexions
 * Conforme NF DTU 65.14
 */

class DessinModule {
    constructor() {
        this.canvas = null;
        this.fabricCanvas = null;
        this.elements = [];
        this.troncons = [];
        this.connections = [];
        this.selectedElement = null;
        this.currentTool = 'select';
        this.gridSize = 20;
        this.snapEnabled = true;
        this.gridEnabled = true;
        
        // State
        this.startPoint = null;
        this.currentElement = null;
        this.drawing = false;
        this.nextId = 1;
        this.connecting = false;
        this.connectionStartElement = null;
        
        // Configuration
        this.config = {
            diametres: [80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000],
            singularites: {},
            lambda: 0.02,
            rho: 1.2
        };
    }
    
    async init() {
        // Charger les configurations
        await this.loadConfigs();
        
        // Initialiser le canvas
        this.initCanvas();
        
        // Attacher les evenements
        this.attachEvents();
        
        // Initialiser les outils de dessin
        this.initDrawTools();
        
        // Charger les donnees par defaut
        this.loadDefaultData();
        
        this.updateSummary();
    }
    
    async loadConfigs() {
        try {
            // Charger les diametres
            const diametres = await window.electronAPI.loadConfig('diametres_nf.json');
            if (diametres && diametres.valeurs) {
                this.config.diametres = diametres.valeurs.sort((a, b) => a - b);
            }
            
            // Charger les singularites
            const singularites = await window.electronAPI.loadConfig('singularites.json');
            if (singularites) {
                this.config.singularites = singularites;
            }
            
            // Charger les parametres par defaut
            const defaults = await window.electronAPI.loadConfig('defaults.json');
            if (defaults) {
                this.config.lambda = defaults.materiaux.acier_galvanise.coefficient_frottement || 0.02;
                this.config.rho = defaults.fluide.masse_volumique || 1.2;
            }
        } catch (error) {
            console.error('Erreur chargement configs dessin:', error);
        }
    }
    
    initCanvas() {
        this.canvas = document.getElementById('canvas-dessin');
        // Optimisation des performances pour getImageData
        this.canvas.willReadFrequently = true;
        
        this.fabricCanvas = new fabric.Canvas(this.canvas, {
            selection: true,
            selectionBorderColor: '#3498db',
            selectionLineWidth: 2,
            selectionColor: 'rgba(52, 152, 219, 0.2)',
            defaultCursor: 'crosshair',
            fireRightClick: true,
            stopContextMenu: true,
            preserveObjectStacking: true,
            perPixelTargetFind: true,
            willReadFrequently: true
        });
        
        // Configurer le canvas
        const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function(...args) {
            this.canvas.willReadFrequently = true;
            return originalGetImageData.apply(this, args);
        };
        
        this.fabricCanvas.setDimensions({
            width: this.canvas.width,
            height: this.canvas.height
        });
        
        // Desactiver le deplacement des elements (seule la selection est autorisee)
        this.fabricCanvas.on('selection:created', (e) => {
            if (e.selected && e.selected.length > 0) {
                const element = e.selected[0];
                this.selectedElement = this.findElementByFabricId(element.id);
                if (this.selectedElement) {
                    this.showProperties(element);
                }
            }
        });
        
        this.fabricCanvas.on('selection:cleared', () => {
            this.selectedElement = null;
            this.hideProperties();
        });
        
        // Gestion du clic droit
        this.fabricCanvas.on('mouse:down:right', (opt) => {
            if (opt.target) {
                this.showContextMenu(opt.target, opt.e);
            }
        });
        
        // Gestion du zoom avec molette
        this.fabricCanvas.on('mouse:wheel', (opt) => {
            const delta = opt.e.deltaY;
            const zoom = this.fabricCanvas.getZoom();
            const newZoom = zoom + (delta > 0 ? -0.1 : 0.1);
            
            if (newZoom > 0.1 && newZoom < 10) {
                this.fabricCanvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, newZoom);
                opt.e.preventDefault();
                opt.e.stopPropagation();
            }
        });
        
        // Gestion du déplacement avec le clic molette (bouton du milieu)
        this.isPanning = false;
        this.lastPanPoint = null;
        
        this.fabricCanvas.on('mouse:down', (opt) => {
            // Vérifier si c'est le bouton du milieu (molette) - bouton 1 dans les événements de souris
            if (opt.e.button === 1) {
                this.isPanning = true;
                this.lastPanPoint = new fabric.Point(opt.e.offsetX, opt.e.offsetY);
                this.canvas.style.cursor = 'grab';
                opt.e.preventDefault();
                opt.e.stopPropagation();
            }
        });
        
        this.fabricCanvas.on('mouse:move', (opt) => {
            if (this.isPanning && this.lastPanPoint) {
                const currentPoint = new fabric.Point(opt.e.offsetX, opt.e.offsetY);
                const delta = {
                    x: currentPoint.x - this.lastPanPoint.x,
                    y: currentPoint.y - this.lastPanPoint.y
                };
                
                // Déplacer le viewport
                const vpt = this.fabricCanvas.viewportTransform;
                if (vpt) {
                    vpt[4] += delta.x;
                    vpt[5] += delta.y;
                    this.fabricCanvas.setViewportTransform(vpt);
                    this.fabricCanvas.renderAll();
                }
                
                this.lastPanPoint = currentPoint;
                opt.e.preventDefault();
                opt.e.stopPropagation();
            }
        });
        
        this.fabricCanvas.on('mouse:up', (opt) => {
            if (opt.e.button === 1) {
                this.isPanning = false;
                this.lastPanPoint = null;
                this.canvas.style.cursor = '';
                this.setToolCursor();
                opt.e.preventDefault();
                opt.e.stopPropagation();
            }
        });
        
        // Dessiner la grille
        this.drawGrid();
    }
    
    initDrawTools() {
        // Selectionner l'outil
        document.querySelectorAll('.draw-tool').forEach(tool => {
            tool.addEventListener('click', () => {
                document.querySelectorAll('.draw-tool').forEach(t => t.classList.remove('active'));
                tool.classList.add('active');
                this.currentTool = tool.dataset.tool;
                this.connecting = false;
                this.connectionStartElement = null;
                this.setToolCursor();
            });
        });
        
        // Options de dessin
        document.getElementById('dessin-snap').addEventListener('change', (e) => {
            this.snapEnabled = e.target.checked;
        });
        
        document.getElementById('dessin-grid').addEventListener('change', (e) => {
            this.gridEnabled = e.target.checked;
            this.drawGrid();
        });
        
        // Boutons de zoom
        document.getElementById('dessin-zoom-in').addEventListener('click', () => {
            const zoom = this.fabricCanvas.getZoom();
            this.fabricCanvas.zoomToPoint({ x: this.canvas.width / 2, y: this.canvas.height / 2 }, zoom * 1.2);
        });
        
        document.getElementById('dessin-zoom-out').addEventListener('click', () => {
            const zoom = this.fabricCanvas.getZoom();
            this.fabricCanvas.zoomToPoint({ x: this.canvas.width / 2, y: this.canvas.height / 2 }, zoom / 1.2);
        });
        
        document.getElementById('dessin-zoom-fit').addEventListener('click', () => {
            this.fabricCanvas.setZoom(1);
            this.fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
            this.centerCanvas();
        });
        
        // Effacer tout
        document.getElementById('dessin-clear').addEventListener('click', () => {
            this.clearAll();
        });
        
        // Bouton de fermeture des proprietes
        document.getElementById('properties-close').addEventListener('click', () => {
            this.hideProperties();
            this.fabricCanvas.discardActiveObject();
        });
        
        // Boutons du formulaire de proprietes
        document.getElementById('properties-apply').addEventListener('click', () => {
            this.applyProperties();
        });
        
        document.getElementById('properties-cancel').addEventListener('click', () => {
            this.hideProperties();
            this.fabricCanvas.discardActiveObject();
        });
    }
    
    attachEvents() {
        // Evenements du canvas
        this.fabricCanvas.on('mouse:down', (opt) => {
            if (opt.e.button === 2) return; // Ignorer le clic droit
            
            const pointer = this.fabricCanvas.getPointer(opt.e);
            const snappedPoint = this.snapEnabled ? this.snapToGrid(pointer) : pointer;
            
            switch (this.currentTool) {
                case 'select':
                    // Verifier si on clique sur un element existant pour commencer une connexion
                    if (opt.target && opt.target.data && (opt.target.data.type === 'bouche' || opt.target.data.type === 'caisson')) {
                        this.startConnection(opt.target);
                    }
                    break;
                    
                case 'gaine':
                    this.startDrawing('gaine', snappedPoint);
                    break;
                    
                case 'bouche':
                    this.addBouche(snappedPoint);
                    break;
                    
                case 'caisson':
                    this.addCaisson(snappedPoint);
                    break;
                    
                case 'coude':
                    this.startDrawing('coude', snappedPoint);
                    break;
            }
        });
        
        this.fabricCanvas.on('mouse:move', (opt) => {
            if (!this.drawing) return;
            
            const pointer = this.fabricCanvas.getPointer(opt.e);
            const snappedPoint = this.snapEnabled ? this.snapToGrid(pointer) : pointer;
            
            switch (this.currentTool) {
                case 'gaine':
                    this.updateGaineDrawing(this.startPoint, snappedPoint);
                    break;
                    
                case 'coude':
                    this.updateCoudeDrawing(this.startPoint, snappedPoint);
                    break;
            }
        });
        
        this.fabricCanvas.on('mouse:up', (opt) => {
            if (!this.drawing) return;
            
            const pointer = this.fabricCanvas.getPointer(opt.e);
            const snappedPoint = this.snapEnabled ? this.snapToGrid(pointer) : pointer;
            
            switch (this.currentTool) {
                case 'gaine':
                    this.finishGaineDrawing(snappedPoint);
                    break;
                    
                case 'coude':
                    this.finishCoudeDrawing(snappedPoint);
                    break;
            }
            
            this.drawing = false;
            this.startPoint = null;
            this.currentElement = null;
        });
        
        // Redimensionnement
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
    }
    
    startConnection(startElement) {
        // Commencer une connexion depuis une bouche ou un caisson
        this.connecting = true;
        this.connectionStartElement = startElement.data;
        this.connectionStartPoint = new fabric.Point(startElement.left || 0, startElement.top || 0);
        
        // Creer une ligne temporaire pour la connexion
        this.currentElement = new fabric.Line([
            this.connectionStartPoint.x, 
            this.connectionStartPoint.y,
            this.connectionStartPoint.x, 
            this.connectionStartPoint.y
        ], {
            stroke: '#27ae60',
            strokeWidth: 2,
            strokeDashArray: [5, 5],
            selectable: false,
            evented: false,
            type: 'temp-connection'
        });
        this.fabricCanvas.add(this.currentElement);
        this.fabricCanvas.renderAll();
    }
    
    setToolCursor() {
        switch (this.currentTool) {
            case 'select':
                this.canvas.style.cursor = 'default';
                break;
            case 'gaine':
            case 'coude':
                this.canvas.style.cursor = 'crosshair';
                break;
            default:
                this.canvas.style.cursor = 'pointer';
        }
    }
    
    snapToGrid(point) {
        const x = Math.round(point.x / this.gridSize) * this.gridSize;
        const y = Math.round(point.y / this.gridSize) * this.gridSize;
        return new fabric.Point(x, y);
    }
    
    drawGrid() {
        // Supprimer l'ancienne grille (fabric ecrase l'option type, on filtre via isGrid)
        const grid = this.fabricCanvas.getObjects().filter(obj => obj.isGrid === true);
        grid.forEach(obj => this.fabricCanvas.remove(obj));
        
        if (!this.gridEnabled) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const gridColor = '#e0e0e0';
        const gridWidth = 1;
        
        // Lignes horizontales
        for (let y = 0; y <= height; y += this.gridSize) {
            const line = new fabric.Line([0, y, width, y], {
                stroke: gridColor,
                strokeWidth: gridWidth,
                selectable: false,
                evented: false,
                isGrid: true
            });
            this.fabricCanvas.add(line);
        }
        
        // Lignes verticales
        for (let x = 0; x <= width; x += this.gridSize) {
            const line = new fabric.Line([x, 0, x, height], {
                stroke: gridColor,
                strokeWidth: gridWidth,
                selectable: false,
                evented: false,
                isGrid: true
            });
            this.fabricCanvas.add(line);
        }
        
        // Garder la grille en arriere-plan
        this.fabricCanvas.getObjects().filter(obj => obj.isGrid === true).forEach(obj => {
            this.fabricCanvas.sendToBack(obj);
        });
        
        this.fabricCanvas.renderAll();
    }
    
    startDrawing(type, startPoint) {
        this.drawing = true;
        this.startPoint = startPoint;
        
        switch (type) {
            case 'gaine':
                // Creer une ligne temporaire
                this.currentElement = new fabric.Line([
                    startPoint.x, startPoint.y,
                    startPoint.x, startPoint.y
                ], {
                    stroke: '#2c3e50',
                    strokeWidth: 3,
                    selectable: false,
                    evented: false,
                    type: 'temp-gaine'
                });
                this.fabricCanvas.add(this.currentElement);
                break;
                
            case 'coude':
                // Creer un arc temporaire
                this.currentElement = new fabric.Path(`M ${startPoint.x} ${startPoint.y}`, {
                    stroke: '#7f8c8d',
                    strokeWidth: 3,
                    fill: '',
                    selectable: false,
                    evented: false,
                    type: 'temp-coude'
                });
                this.fabricCanvas.add(this.currentElement);
                break;
        }
    }
    
    updateGaineDrawing(startPoint, endPoint) {
        if (!this.currentElement) return;
        
        this.currentElement.set({ x1: startPoint.x, y1: startPoint.y, x2: endPoint.x, y2: endPoint.y });
        this.fabricCanvas.renderAll();
    }
    
    updateCoudeDrawing(startPoint, endPoint) {
        if (!this.currentElement) return;
        
        // Calculer l'arc
        const center = new fabric.Point((startPoint.x + endPoint.x) / 2, (startPoint.y + endPoint.y) / 2);
        const radius = Math.sqrt(
            Math.pow(endPoint.x - center.x, 2) + Math.pow(endPoint.y - center.y, 2)
        );
        
        // Simple arc pour l'instant
        const path = `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 0 1 ${endPoint.x} ${endPoint.y}`;
        this.currentElement.set({ path: path });
        this.fabricCanvas.renderAll();
    }
    
    finishGaineDrawing(endPoint) {
        if (!this.currentElement || !this.startPoint) return;
        
        const length = Math.sqrt(
            Math.pow(endPoint.x - this.startPoint.x, 2) + 
            Math.pow(endPoint.y - this.startPoint.y, 2)
        );
        
        // Detecter si on se connecte a un element existant
        const nearElement = this.findElementAtPoint(endPoint, 20);
        
        // Vérifier si le point de départ est connecté à un élément existant
        const startNearElement = this.findElementAtPoint(this.startPoint, 20);
        
        // Vérifier si la gaine est connectée à au moins un élément (début ou fin)
        const isConnected = nearElement !== null || startNearElement !== null;
        
        // Si la gaine n'est pas connectée, afficher un message d'erreur et annuler
        if (!isConnected) {
            this.showMessage('Erreur', 'Une gaine doit être connectée à au moins un élément (bouche, caisson, jonction ou autre gaine).');
            this.fabricCanvas.remove(this.currentElement);
            this.currentElement = null;
            this.drawing = false;
            this.startPoint = null;
            return;
        }
        
        // Creer la gaine finale
        const gaine = {
            id: this.nextId++,
            type: 'gaine',
            x1: this.startPoint.x,
            y1: this.startPoint.y,
            x2: endPoint.x,
            y2: endPoint.y,
            longueur: (length / this.gridSize).toFixed(2),
            diametre: 200,
            debit: 500,
            vitesse: null,
            pertesCharge: null,
            pertesSingulieres: 0,
            nom: `T${this.nextId - 1}`,
            connectedTo: nearElement ? nearElement.id : (startNearElement ? startNearElement.id : null),
            connectionPoint: nearElement ? { x: endPoint.x, y: endPoint.y } : (startNearElement ? { x: this.startPoint.x, y: this.startPoint.y } : null)
        };
        
        // Si on se connecte a un element existant, creer une jonction automatique
        if (nearElement && nearElement.type !== 'gaine') {
            this.createAutoJonction(this.startPoint, endPoint, gaine, nearElement);
        } else if (startNearElement && startNearElement.type !== 'gaine') {
            // Si c'est le point de départ qui est connecté, créer une jonction
            this.createAutoJonction(endPoint, this.startPoint, gaine, startNearElement);
        }
        
        // Calculer les proprieties
        this.calculerProprietesTroncon(gaine);
        
        // Ajouter au canvas
        this.addGaineToCanvas(gaine);
        
        // Ajouter a la liste
        this.elements.push(gaine);
        this.troncons.push(gaine);
        
        // Si on a une connexion, ajouter la relation
        if (nearElement) {
            this.connections.push({
                from: gaine.id,
                to: nearElement.id,
                type: 'connection'
            });
        } else if (startNearElement) {
            this.connections.push({
                from: gaine.id,
                to: startNearElement.id,
                type: 'connection'
            });
        }
        
        // Supprimer l'element temporaire
        this.fabricCanvas.remove(this.currentElement);
        this.currentElement = null;
        
        this.updateSummary();
        this.centerCanvas();
    }
    
    createAutoJonction(startPoint, endPoint, newGaine, targetElement) {
        // Determiner le type de jonction en fonction de la geometrie
        const angle = this.calculateAngle(startPoint, endPoint);
        
        // Pour l'instant, on cree une jonction simple
        // Le type sera determine par le nombre de connexions existantes
        const existingConnections = this.connections.filter(c => c.to === targetElement.id).length;
        
        let jonctionType;
        if (existingConnections >= 2) {
            // Deja 2 connexions, on a besoin d'une jonction T ou Y
            jonctionType = 't';
        } else {
            // Premiere ou deuxieme connexion, pas besoin de jonction
            return;
        }
        
        const jonction = {
            id: this.nextId++,
            type: `jonction_${jonctionType}`,
            x: endPoint.x,
            y: endPoint.y,
            typeJonction: jonctionType,
            k: this.getKValueForJonction(jonctionType),
            nom: `${jonctionType.toUpperCase()}${this.nextId - 1}`,
            connectedElements: [newGaine.id, targetElement.id]
        };
        
        this.elements.push(jonction);
        
        // Ajouter au canvas
        this.addJonctionToCanvas(jonction);
    }
    
    calculateAngle(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.atan2(dy, dx) * (180 / Math.PI);
    }
    
    getKValueForJonction(type) {
        const mapping = {
            't': 0.5,
            'y': 0.4,
            'coude_90': 0.25,
            'coude_45': 0.15
        };
        return mapping[type] || 0.25;
    }
    
    findElementAtPoint(point, radius = 20) {
        // Chercher un element a proximite du point
        for (let i = 0; i < this.elements.length; i++) {
            const el = this.elements[i];
            if (el.type === 'bouche' || el.type === 'caisson' || el.type === 'jonction') {
                const dx = (el.x || 0) - point.x;
                const dy = (el.y || 0) - point.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= radius) {
                    return el;
                }
            } else if (el.type === 'gaine' || el.type === 'coude') {
                // Pour les gaines et coudes, vérifier les extrémités
                const dx1 = (el.x1 || 0) - point.x;
                const dy1 = (el.y1 || 0) - point.y;
                const dx2 = (el.x2 || 0) - point.x;
                const dy2 = (el.y2 || 0) - point.y;
                const distance1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                if (distance1 <= radius || distance2 <= radius) {
                    return el;
                }
            }
        }
        return null;
    }
    
    finishCoudeDrawing(endPoint) {
        if (!this.currentElement || !this.startPoint) return;
        
        const coude = {
            id: this.nextId++,
            type: 'coude',
            x1: this.startPoint.x,
            y1: this.startPoint.y,
            x2: endPoint.x,
            y2: endPoint.y,
            typeSingularite: 'coude_90',
            k: 0.25,
            nom: `C${this.nextId - 1}`
        };
        
        // Ajouter au canvas
        this.addCoudeToCanvas(coude);
        
        // Ajouter a la liste
        this.elements.push(coude);
        
        // Supprimer l'element temporaire
        this.fabricCanvas.remove(this.currentElement);
        this.currentElement = null;
        
        this.updateSummary();
        this.centerCanvas();
    }
    
    addBouche(point) {
        const bouche = {
            id: this.nextId++,
            type: 'bouche',
            x: point.x,
            y: point.y,
            diametre: 125,
            debit: 200,
            typeBouche: 'entree',
            vitesse: null,
            nom: `B${this.nextId - 1}`
        };
        
        // Calculer les proprieties
        this.calculerProprietesBouche(bouche);
        
        this.addBoucheToCanvas(bouche);
        this.elements.push(bouche);
        
        // Selectionner la nouvelle bouche pour permettre la modification des proprieties
        setTimeout(() => {
            this.selectElementById(bouche.id);
        }, 100);
        
        this.updateSummary();
    }
    
    addCaisson(point) {
        const caisson = {
            id: this.nextId++,
            type: 'caisson',
            x: point.x,
            y: point.y,
            debit: 1000,
            typeCaisson: 'insufflation',
            nom: `Caisson${this.nextId - 1}`
        };
        
        this.addCaissonToCanvas(caisson);
        this.elements.push(caisson);
        
        // Selectionner le nouveau caisson
        setTimeout(() => {
            this.selectElementById(caisson.id);
        }, 100);
        
        this.updateSummary();
    }
    
    selectElementById(elementId) {
        const fabricObj = this.fabricCanvas.getObjects().find(obj => {
            if (obj.id === elementId) return true;
            if (obj.data && obj.data.id === elementId) return true;
            return false;
        });
        
        if (fabricObj) {
            this.fabricCanvas.setActiveObject(fabricObj);
            this.fabricCanvas.renderAll();
        }
    }
    
    addGaineToCanvas(gaine) {
        const line = new fabric.Line([gaine.x1, gaine.y1, gaine.x2, gaine.y2], {
            stroke: '#2c3e50',
            strokeWidth: 3,
            selectable: true,
            hasControls: false,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true,
            originX: 'center',
            originY: 'center',
            id: gaine.id,
            type: 'gaine',
            data: gaine,
            evented: true
        });
        
        // Ajouter le nom
        const midX = (gaine.x1 + gaine.x2) / 2;
        const midY = (gaine.y1 + gaine.y2) / 2;
        const text = new fabric.Text(gaine.nom, {
            left: midX + 10,
            top: midY - 20,
            fontSize: 12,
            fill: '#2c3e50',
            selectable: false,
            evented: false,
            backgroundColor: 'rgba(255,255,255,0.7)',
            padding: 2
        });
        
        const group = new fabric.Group([line, text], {
            id: gaine.id,
            type: 'gaine-group',
            data: gaine,
            selectable: true,
            hasControls: false,
            lockMovementX: true,
            lockMovementY: true
        });
        
        this.fabricCanvas.add(group);
    }
    
    addBoucheToCanvas(bouche) {
        const circle = new fabric.Circle({
            left: bouche.x,
            top: bouche.y,
            radius: 15,
            fill: '#3498db',
            stroke: '#2980b9',
            strokeWidth: 2,
            originX: 'center',
            originY: 'center',
            selectable: true,
            hasControls: false,
            lockMovementX: false,
            lockMovementY: false,
            lockRotation: true,
            id: bouche.id,
            type: 'bouche',
            data: bouche
        });
        
        const text = new fabric.Text(bouche.nom, {
            left: bouche.x + 20,
            top: bouche.y - 15,
            fontSize: 12,
            fill: '#2c3e50',
            selectable: false,
            evented: false,
            backgroundColor: 'rgba(255,255,255,0.7)',
            padding: 2
        });
        
        const group = new fabric.Group([circle, text], {
            id: bouche.id,
            type: 'bouche-group',
            data: bouche,
            selectable: true,
            hasControls: false,
            lockRotation: true
        });
        
        this.fabricCanvas.add(group);
    }
    
    addCaissonToCanvas(caisson) {
        const rect = new fabric.Rect({
            left: caisson.x - 30,
            top: caisson.y - 30,
            width: 60,
            height: 60,
            fill: '#e74c3c',
            stroke: '#c0392b',
            strokeWidth: 2,
            originX: 'center',
            originY: 'center',
            selectable: true,
            hasControls: false,
            lockMovementX: false,
            lockMovementY: false,
            lockRotation: true,
            id: caisson.id,
            type: 'caisson',
            data: caisson
        });
        
        const text = new fabric.Text(caisson.nom, {
            left: caisson.x + 40,
            top: caisson.y - 15,
            fontSize: 12,
            fill: '#2c3e50',
            selectable: false,
            evented: false,
            backgroundColor: 'rgba(255,255,255,0.7)',
            padding: 2
        });
        
        const group = new fabric.Group([rect, text], {
            id: caisson.id,
            type: 'caisson-group',
            data: caisson,
            selectable: true,
            hasControls: false,
            lockRotation: true
        });
        
        this.fabricCanvas.add(group);
    }
    
    addJonctionToCanvas(jonction) {
        const path = jonction.typeJonction === 't' ? 
            'M -20 -20 L 20 -20 M 0 -20 L 0 20' :
            'M -20 -20 L 0 0 L 20 -20 M 0 0 L 0 20';
        
        const jPath = new fabric.Path(path, {
            left: jonction.x,
            top: jonction.y,
            fill: '#7f8c8d',
            stroke: '#555',
            strokeWidth: 2,
            originX: 'center',
            originY: 'center',
            selectable: true,
            hasControls: false,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true,
            id: jonction.id,
            type: 'jonction',
            data: jonction
        });
        
        const text = new fabric.Text(jonction.nom, {
            left: jonction.x + 25,
            top: jonction.y - 15,
            fontSize: 12,
            fill: '#2c3e50',
            selectable: false,
            evented: false,
            backgroundColor: 'rgba(255,255,255,0.7)',
            padding: 2
        });
        
        const group = new fabric.Group([jPath, text], {
            id: jonction.id,
            type: 'jonction-group',
            data: jonction,
            selectable: true,
            hasControls: false,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true
        });
        
        this.fabricCanvas.add(group);
    }
    
    addCoudeToCanvas(coude) {
        // Simple arc pour le coude
        const centerX = (coude.x1 + coude.x2) / 2;
        const centerY = (coude.y1 + coude.y2) / 2;
        const radius = Math.sqrt(
            Math.pow(coude.x2 - centerX, 2) + Math.pow(coude.y2 - centerY, 2)
        );
        
        const path = `M ${coude.x1} ${coude.y1} A ${radius} ${radius} 0 0 1 ${coude.x2} ${coude.y2}`;
        
        const cPath = new fabric.Path(path, {
            stroke: '#7f8c8d',
            strokeWidth: 3,
            fill: '',
            selectable: true,
            hasControls: false,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true,
            id: coude.id,
            type: 'coude',
            data: coude
        });
        
        const text = new fabric.Text(coude.nom, {
            left: centerX + 15,
            top: centerY - 15,
            fontSize: 12,
            fill: '#2c3e50',
            selectable: false,
            evented: false,
            backgroundColor: 'rgba(255,255,255,0.7)',
            padding: 2
        });
        
        const group = new fabric.Group([cPath, text], {
            id: coude.id,
            type: 'coude-group',
            data: coude,
            selectable: true,
            hasControls: false,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true
        });
        
        this.fabricCanvas.add(group);
    }
    
    calculerProprietesBouche(bouche) {
        // Calcul simple pour la bouche
        const Q = bouche.debit / 3600; // m3/s
        const V_max = 4.0; // m/s
        
        const D_theorique = Math.sqrt((4 * Q) / (Math.PI * V_max));
        const D_mm = D_theorique * 1000;
        
        // Trouver le diametre commercial
        for (let i = 0; i < this.config.diametres.length; i++) {
            if (this.config.diametres[i] >= D_mm) {
                bouche.diametre = this.config.diametres[i];
                break;
            }
        }
        
        // Calculer la vitesse reelle
        const D_m = (bouche.diametre || 125) / 1000;
        bouche.vitesse = (4 * Q) / (Math.PI * D_m * D_m);
    }
    
    calculerProprietesTroncon(troncon) {
        const Q = troncon.debit / 3600; // m3/s
        const V_max = 4.0; // m/s
        
        const D_theorique = Math.sqrt((4 * Q) / (Math.PI * V_max));
        const D_mm = D_theorique * 1000;
        
        // Trouver le diametre commercial
        for (let i = 0; i < this.config.diametres.length; i++) {
            if (this.config.diametres[i] >= D_mm) {
                troncon.diametre = this.config.diametres[i];
                break;
            }
        }
        
        // Calculer la vitesse reelle
        const D_m = troncon.diametre / 1000;
        troncon.vitesse = (4 * Q) / (Math.PI * D_m * D_m);
        
        // Calculer les pertes de charge lineaires
        const L = parseFloat(troncon.longueur) || 0;
        troncon.pertesCharge = this.config.lambda * (L / D_m) * (this.config.rho * troncon.vitesse * troncon.vitesse) / 2;
        
        // Calculer les pertes singulieres (si connecte)
        if (troncon.connectedTo) {
            // Trouver l'element connecte
            const connectedEl = this.findElementById(troncon.connectedTo);
            if (connectedEl && connectedEl.type === 'bouche') {
                // Pertes a l'entree/sortie
                troncon.pertesSingulieres = this.config.singularites?.entrees_sorties?.bouche || 0.8;
            } else if (connectedEl && connectedEl.type && connectedEl.type.startsWith('jonction_')) {
                troncon.pertesSingulieres = connectedEl.k || 0;
            }
        }
    }
    
    findElementByFabricId(id) {
        for (let i = 0; i < this.elements.length; i++) {
            if (this.elements[i].id === id) {
                return this.elements[i];
            }
        }
        return null;
    }
    
    findElementById(id) {
        for (let i = 0; i < this.elements.length; i++) {
            if (this.elements[i].id === id) {
                return this.elements[i];
            }
        }
        return null;
    }
    
    showProperties(fabricObject) {
        // Si on clique sur un groupe, recuperer le premier objet
        let element;
        if (fabricObject.type === 'group' && fabricObject.item && fabricObject.item(0)) {
            const firstObj = fabricObject.item(0);
            element = firstObj.data || this.findElementByFabricId(firstObj.id);
        } else {
            element = fabricObject.data || this.findElementByFabricId(fabricObject.id);
        }
        
        if (!element) return;
        
        // Afficher le panneau
        const panel = document.getElementById('properties-panel');
        panel.classList.remove('closed');
        
        // Masquer le message vide
        document.getElementById('properties-empty').classList.add('hidden');
        
        // Afficher le formulaire
        const form = document.getElementById('properties-form');
        form.classList.remove('hidden');
        
        // Remplir le formulaire
        document.getElementById('property-id').value = element.id;
        document.getElementById('property-type').value = element.type;
        document.getElementById('property-nom').value = element.nom || '';
        
        // Masquer toutes les sections specifiques
        document.querySelectorAll('.form-section').forEach(s => s.style.display = 'none');
        
        // Afficher les sections communes
        document.getElementById('property-section-debit').style.display = 'block';
        
        if (element.debit !== undefined) {
            document.getElementById('property-debit').value = element.debit;
        } else {
            document.getElementById('property-debit').value = '';
        }
        
        if (element.diametre !== undefined) {
            document.getElementById('property-section-diametre').style.display = 'block';
            document.getElementById('property-diametre').value = element.diametre;
            if (element.longueur !== undefined) {
                document.getElementById('property-longueur').value = element.longueur;
            }
        }
        
        if (element.typeCaisson !== undefined) {
            document.getElementById('property-section-caisson').style.display = 'block';
            document.getElementById('property-type-caisson').value = element.typeCaisson;
        }
        
        if (element.typeBouche !== undefined) {
            document.getElementById('property-section-bouche').style.display = 'block';
            document.getElementById('property-type-bouche').value = element.typeBouche;
        }
        
        // Stocker la reference
        this.selectedElement = element;
    }
    
    hideProperties() {
        const panel = document.getElementById('properties-panel');
        panel.classList.add('closed');
        
        document.getElementById('properties-empty').classList.remove('hidden');
        document.getElementById('properties-form').classList.add('hidden');
        
        this.selectedElement = null;
    }
    
    applyProperties() {
        if (!this.selectedElement) return;
        
        // Mettre a jour les proprieties
        this.selectedElement.nom = document.getElementById('property-nom').value;
        
        if (this.selectedElement.debit !== undefined) {
            this.selectedElement.debit = parseFloat(document.getElementById('property-debit').value) || 0;
        }
        
        if (this.selectedElement.diametre !== undefined) {
            this.selectedElement.diametre = parseInt(document.getElementById('property-diametre').value) || 0;
        }
        
        if (this.selectedElement.longueur !== undefined) {
            this.selectedElement.longueur = parseFloat(document.getElementById('property-longueur').value) || 0;
        }
        
        if (this.selectedElement.typeCaisson !== undefined) {
            this.selectedElement.typeCaisson = document.getElementById('property-type-caisson').value;
        }
        
        if (this.selectedElement.typeBouche !== undefined) {
            this.selectedElement.typeBouche = document.getElementById('property-type-bouche').value;
        }
        
        // Recalculer les proprieties
        if (this.selectedElement.type === 'gaine' || this.selectedElement.type === 'troncon') {
            this.calculerProprietesTroncon(this.selectedElement);
        } else if (this.selectedElement.type === 'bouche') {
            this.calculerProprietesBouche(this.selectedElement);
        }
        
        // Mettre a jour l'affichage
        this.updateElementOnCanvas(this.selectedElement);
        this.updateSummary();
        
        this.hideProperties();
    }
    
    getKValue(type) {
        const mapping = {
            'coude_90': 0.25,
            'coude_45': 0.15,
            't_branchement': 0.5,
            't_droit': 0.3,
            'y_branchement': 0.4,
            'reduction': 0.1
        };
        return mapping[type] || 0.25;
    }
    
    updateElementOnCanvas(element) {
        const obj = this.fabricCanvas.getObjects().find(o => {
            if (o.id === element.id) return true;
            if (o.data && o.data.id === element.id) return true;
            return false;
        });
        
        if (!obj) return;
        
        // Mettre a jour le nom dans le texte
        if (obj.type === 'group') {
            for (let i = 0; i < obj.size(); i++) {
                const item = obj.item(i);
                if (item.type === 'text') {
                    item.set({ text: element.nom || `Element${element.id}` });
                }
            }
            obj.set({ data: element });
            this.fabricCanvas.renderAll();
        }
    }
    
    showContextMenu(target, event) {
        event.preventDefault();
        this.showProperties(target);
    }
    
    showMessage(title, message) {
        // Afficher un message dans la barre de statut ou une alerte
        if (window.ventilationApp && window.ventilationApp.showMessage) {
            window.ventilationApp.showMessage(title, message);
        } else {
            // Afficher une alerte simple si l'application n'est pas disponible
            alert(`${title}: ${message}`);
        }
    }
    
    clearAll() {
        this.elements = [];
        this.troncons = [];
        this.connections = [];
        this.nextId = 1;
        this.selectedElement = null;
        
        this.fabricCanvas.clear();
        this.drawGrid();
        this.hideProperties();
        this.updateSummary();
    }
    
    centerCanvas() {
        if (this.fabricCanvas.getObjects().length === 0) return;
        
        const center = this.fabricCanvas.getCenter();
        this.fabricCanvas.setViewportTransform([1, 0, 0, 1, center.left, center.top]);
        this.fabricCanvas.renderAll();
    }
    
    resizeCanvas() {
        const container = document.querySelector('.dessin-area');
        if (!container) return;
        
        const width = container.clientWidth;
        const height = container.clientHeight - 60;
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        this.fabricCanvas.setDimensions({ width, height });
        this.drawGrid();
        this.centerCanvas();
    }
    
    updateSummary() {
        const count = this.elements.length;
        const tronconCount = this.troncons.length;
        
        let totalDebit = 0;
        let totalDP = 0;
        
        this.elements.forEach(el => {
            totalDebit += parseFloat(el.debit) || 0;
        });
        
        this.troncons.forEach(t => {
            totalDP += parseFloat(t.pertesCharge) || 0;
            totalDP += parseFloat(t.pertesSingulieres) || 0;
        });
        
        document.getElementById('dessin-element-count').textContent = count;
        document.getElementById('dessin-troncon-count').textContent = tronconCount;
        document.getElementById('dessin-total-debit').textContent = `${totalDebit} m3/h`;
        document.getElementById('dessin-total-dp').textContent = `${totalDP.toFixed(2)} Pa`;
    }
    
    calculateAll() {
        // Recalculer toutes les proprietes
        this.troncons.forEach(troncon => {
            this.calculerProprietesTroncon(troncon);
        });
        
        this.elements.forEach(el => {
            if (el.type === 'bouche') {
                this.calculerProprietesBouche(el);
            }
        });
        
        // Mettre a jour l'affichage
        this.elements.forEach(el => {
            this.updateElementOnCanvas(el);
        });
        
        this.updateSummary();
    }
    
    loadDefaultData() {
        // Ajouter quelques elements par defaut
        const gaine1 = {
            id: 1,
            type: 'gaine',
            x1: 200,
            y1: 200,
            x2: 400,
            y2: 200,
            longueur: 2.0,
            diametre: 200,
            debit: 500,
            vitesse: null,
            pertesCharge: null,
            pertesSingulieres: 0,
            nom: 'T1'
        };
        
        const gaine2 = {
            id: 2,
            type: 'gaine',
            x1: 400,
            y1: 200,
            x2: 400,
            y2: 350,
            longueur: 1.5,
            diametre: 160,
            debit: 200,
            vitesse: null,
            pertesCharge: null,
            pertesSingulieres: 0,
            nom: 'T2'
        };
        
        const gaine3 = {
            id: 3,
            type: 'gaine',
            x1: 400,
            y1: 200,
            x2: 600,
            y2: 200,
            longueur: 2.0,
            diametre: 160,
            debit: 300,
            vitesse: null,
            pertesCharge: null,
            pertesSingulieres: 0,
            nom: 'T3'
        };
        
        const caisson = {
            id: 4,
            type: 'caisson',
            x: 200,
            y: 200,
            debit: 500,
            typeCaisson: 'insufflation',
            nom: 'Caisson1'
        };
        
        const bouches = [
            { id: 5, type: 'bouche', x: 400, y: 350, diametre: 125, debit: 200, typeBouche: 'sortie', nom: 'B1', vitesse: null },
            { id: 6, type: 'bouche', x: 600, y: 200, diametre: 125, debit: 300, typeBouche: 'sortie', nom: 'B2', vitesse: null }
        ];
        
        // Calculer les proprietes
        [gaine1, gaine2, gaine3].forEach(g => this.calculerProprietesTroncon(g));
        bouches.forEach(b => this.calculerProprietesBouche(b));
        
        // Ajouter au canvas
        this.elements = [...bouches, caisson, gaine1, gaine2, gaine3];
        this.troncons = [gaine1, gaine2, gaine3];
        this.nextId = 7;
        
        // Dessiner
        this.addCaissonToCanvas(caisson);
        bouches.forEach(b => this.addBoucheToCanvas(b));
        [gaine1, gaine2, gaine3].forEach(g => this.addGaineToCanvas(g));
        
        this.updateSummary();
    }
    
    // ==================== EXTENSIONS ====================
    
    /**
     * Equilibre automatiquement les debits du reseau
     * Repartit le debit total du caisson entre les bouches connectees
     */
    equilibrerReseau() {
        const caisson = this.elements.find(e => e.type === 'caisson' && e.typeCaisson === 'insufflation');
        if (!caisson) {
            console.warn('Aucun caisson insufflation trouve pour equilibrage');
            return;
        }
        
        const bouchesSortie = this.elements.filter(e => e.type === 'bouche' && e.typeBouche === 'sortie');
        if (bouchesSortie.length === 0) {
            console.warn('Aucune bouche de sortie trouvee');
            return;
        }
        
        const debitTotal = caisson.debit || 0;
        const debitParBouche = debitTotal / bouchesSortie.length;
        
        bouchesSortie.forEach(bouche => {
            bouche.debit = debitParBouche;
            this.calculerProprietesBouche(bouche);
        });
        
        this.troncons.forEach(troncon => {
            if (troncon.connectedTo) {
                const connectedEl = this.findElementById(troncon.connectedTo);
                if (connectedEl && connectedEl.type === 'bouche') {
                    troncon.debit = connectedEl.debit;
                    this.calculerProprietesTroncon(troncon);
                }
            }
        });
        
        this.elements.forEach(el => this.updateElementOnCanvas(el));
        this.updateSummary();
        
        return { success: true, message: `Reseau equilibre: ${debitParBouche.toFixed(0)} m3/h par bouche` };
    }
    
    /**
     * Calcule les pertes de charge singulieres reelles basees sur les connexions
     */
    calculerPertesSingulieresReelles() {
        this.troncons.forEach(troncon => {
            troncon.pertesSingulieres = 0;
            
            if (troncon.connectedTo) {
                const connectedEl = this.findElementById(troncon.connectedTo);
                if (connectedEl) {
                    if (connectedEl.type === 'bouche') {
                        const k = this.config.singularites?.entrees_sorties?.[connectedEl.typeBouche] || 0.8;
                        troncon.pertesSingulieres += k * (this.config.rho * Math.pow(troncon.vitesse || 0, 2)) / 2;
                    } else if (connectedEl.type === 'caisson') {
                        troncon.pertesSingulieres += 0.5 * (this.config.rho * Math.pow(troncon.vitesse || 0, 2)) / 2;
                    } else if (connectedEl.type && connectedEl.type.startsWith('jonction_')) {
                        troncon.pertesSingulieres += (connectedEl.k || 0) * (this.config.rho * Math.pow(troncon.vitesse || 0, 2)) / 2;
                    }
                }
            }
            
            // Ajouter les pertes pour chaque extremite
            const D_m = (troncon.diametre || 200) / 1000;
            troncon.pertesSingulieres += 0.1 * (this.config.rho * Math.pow((troncon.vitesse || 0), 2)) / 2;
        });
        
        this.troncons.forEach(troncon => this.updateElementOnCanvas(troncon));
        this.updateSummary();
    }
    
    /**
     * Detecte et cree automatiquement les jonctions entre les gaines
     */
    detecterJonctionsAutomatiques() {
        this.troncons.forEach(gaine => {
            const endPoint = { x: gaine.x2, y: gaine.y2 };
            const nearElements = this.findElementsAtPoint(endPoint, 30);
            
            nearElements.forEach(nearEl => {
                if (nearEl.type === 'gaine' && nearEl.id !== gaine.id) {
                    if ((Math.abs(nearEl.x1 - endPoint.x) < 30 && Math.abs(nearEl.y1 - endPoint.y) < 30) ||
                        (Math.abs(nearEl.x2 - endPoint.x) < 30 && Math.abs(nearEl.y2 - endPoint.y) < 30)) {
                        
                        const jonction = {
                            id: this.nextId++,
                            type: 'jonction_t',
                            x: endPoint.x,
                            y: endPoint.y,
                            typeJonction: 't',
                            k: 0.5,
                            nom: `T${this.nextId - 1}`,
                            connectedElements: [gaine.id, nearEl.id]
                        };
                        
                        if (!this.elements.some(el => el.type === 'jonction_t' && 
                            Math.abs(el.x - endPoint.x) < 20 && Math.abs(el.y - endPoint.y) < 20)) {
                            this.elements.push(jonction);
                            this.addJonctionToCanvas(jonction);
                            
                            gaine.connectedTo = jonction.id;
                            nearEl.connectedTo = jonction.id;
                            
                            this.connections.push({
                                from: gaine.id,
                                to: jonction.id,
                                type: 'connection'
                            });
                            this.connections.push({
                                from: nearEl.id,
                                to: jonction.id,
                                type: 'connection'
                            });
                        }
                    }
                }
            });
        });
        
        this.updateSummary();
    }
    
    /**
     * Trouve tous les elements a proximite d'un point
     */
    findElementsAtPoint(point, radius = 20) {
        const results = [];
        this.elements.forEach(el => {
            if (el.x !== undefined && el.y !== undefined) {
                const dx = el.x - point.x;
                const dy = el.y - point.y;
                if (Math.sqrt(dx * dx + dy * dy) <= radius) {
                    results.push(el);
                }
            }
            if (el.type === 'gaine') {
                const dx1 = el.x1 - point.x;
                const dy1 = el.y1 - point.y;
                const dx2 = el.x2 - point.x;
                const dy2 = el.y2 - point.y;
                if (Math.sqrt(dx1 * dx1 + dy1 * dy1) <= radius || Math.sqrt(dx2 * dx2 + dy2 * dy2) <= radius) {
                    results.push(el);
                }
            }
        });
        return results;
    }
    
    // ============================================
    
    exportToDXF() {
        let dxf = '999\nDXF created by Reseau Ventilation Pro\n';
        dxf += 'SECTION 2\nENTITIES\n';
        
        this.elements.forEach(el => {
            if (el.type === 'gaine') {
                dxf += `LINE\n8\n0\n10\n${el.x1}\n20\n${el.y1}\n11\n${el.x2}\n21\n${el.y2}\n`;
            } else if (el.type === 'bouche') {
                dxf += `CIRCLE\n8\n0\n10\n${el.x}\n20\n${el.y}\n40\n15\n`;
            } else if (el.type === 'caisson') {
                dxf += `SOLID\n8\n0\n10\n${el.x - 30}\n20\n${el.y - 30}\n11\n${el.x + 30}\n21\n${el.y - 30}\n12\n${el.x + 30}\n22\n${el.y + 30}\n13\n${el.x - 30}\n23\n${el.y + 30}\n`;
            } else if (el.type && el.type.startsWith('jonction_')) {
                // Jonction en forme de T ou Y
                dxf += `LINE\n8\n0\n10\n${el.x - 20}\n20\n${el.y}\n11\n${el.x + 20}\n21\n${el.y}\n`;
                dxf += `LINE\n8\n0\n10\n${el.x}\n20\n${el.y - 20}\n11\n${el.x}\n21\n${el.y + 20}\n`;
            }
        });
        
        dxf += 'ENDSEC\n0\nEOF\n';
        return dxf;
    }
    
    exportToJSON() {
        return {
            type: 'dessin',
            elements: this.elements,
            troncons: this.troncons,
            connections: this.connections
        };
    }
    
    checkConsistency() {
        const errors = [];
        
        // Verifier que chaque bouche a un debit
        this.elements.filter(e => e.type === 'bouche').forEach(bouche => {
            if (!bouche.debit || bouche.debit <= 0) {
                errors.push(`La bouche "${bouche.nom}" n'a pas de debit defini`);
            }
        });
        
        // Verifier que chaque caisson a un debit
        this.elements.filter(e => e.type === 'caisson').forEach(caisson => {
            if (!caisson.debit || caisson.debit <= 0) {
                errors.push(`Le caisson "${caisson.nom}" n'a pas de debit defini`);
            }
        });
        
        // Verifier les connexions
        this.troncons.forEach(troncon => {
            if (!troncon.longueur || troncon.longueur <= 0) {
                errors.push(`Le troncon "${troncon.nom}" n'a pas de longueur definie`);
            }
            if (!troncon.debit || troncon.debit <= 0) {
                errors.push(`Le troncon "${troncon.nom}" n'a pas de debit defini`);
            }
        });
        
        // Verifier l'equilibrage des debits
        const totalIn = this.elements
            .filter(e => e.type === 'caisson' && e.typeCaisson === 'insufflation')
            .reduce((sum, e) => sum + (e.debit || 0), 0);
        const totalOut = this.elements
            .filter(e => e.type === 'bouche' && e.typeBouche === 'sortie')
            .reduce((sum, e) => sum + (e.debit || 0), 0);
        
        if (Math.abs(totalIn - totalOut) > 1) {
            errors.push(`Desequilibre des debits: Entree=${totalIn} m3/h, Sortie=${totalOut} m3/h`);
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
}

// Exporter l'instance
const dessinModule = new DessinModule();
window.dessinModule = dessinModule;
