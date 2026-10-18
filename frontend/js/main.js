window.API_URL = window.API_URL || '/api';
var API_URL = window.API_URL;

// ==================== REDIRECIONAMENTO PARA PÁGINA DE CADASTRO ====================
window.openAddBeachModal = function(geoData) {
    const params = new URLSearchParams();
    if (geoData) {
        if (geoData.coords && Array.isArray(geoData.coords)) {
            params.set('lat', Number(geoData.coords[0]).toFixed(6));
            params.set('lng', Number(geoData.coords[1]).toFixed(6));
        } else if (geoData.lat && geoData.lng) {
            params.set('lat', Number(geoData.lat).toFixed(6));
            params.set('lng', Number(geoData.lng).toFixed(6));
        }
        if (geoData.areaCoords) {
            params.set('area', JSON.stringify(geoData.areaCoords));
        }
        if (geoData.name) {
            params.set('name', geoData.name);
        }
        if (geoData.region) {
            params.set('region', geoData.region);
        }
    } else if (window.lastMapClickedGeo) {
        params.set('lat', Number(window.lastMapClickedGeo.lat).toFixed(6));
        params.set('lng', Number(window.lastMapClickedGeo.lng).toFixed(6));
    }
    const query = params.toString();
    window.location.href = query ? `cadastrar-praia.html?${query}` : 'cadastrar-praia.html';
};

window.openAddBeachModalWithCoords = function() {
    window.openAddBeachModal(window.lastMapClickedGeo);
};

window.closeAddBeachModal = function() {
    // Mantido para compatibilidade sem erros
};

window.openAreaModal = function(areaData) {
    const modal = document.getElementById('area-action-modal');
    if (!modal) return;

    const countEl = document.getElementById('area-point-count');
    if (countEl && areaData && areaData.points) {
        countEl.textContent = areaData.points.length;
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    document.body.style.overflow = 'hidden';
};

window.closeAreaModal = function(e) {
    const modal = document.getElementById('area-action-modal');
    if (!modal) return;
    if (e && e.target && e.target !== modal && !e.target.closest('.modal-close-btn') && e.target.tagName !== 'BUTTON') {
        return;
    }
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.style.opacity = '0';
    document.body.style.overflow = '';
};

// Tecla ESC fecha modais e cards
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeAddBeachModal();
        window.closeAreaModal();
        if (typeof window.closeMapCard === 'function') window.closeMapCard();
        if (typeof window.cancelDrawingMode === 'function') window.cancelDrawingMode();
    }
});

// ==================== INICIALIZAÇÃO DA INTERFACE & MAPA ====================
document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos do DOM
    const mapContainer = document.getElementById('ubatuba-leaflet-map');
    const floatingCard = document.getElementById('map-floating-card');
    const cardInnerContent = document.getElementById('card-inner-content');
    const manualSelect = document.getElementById('manual-praia-select');
    const cardsGrid = document.getElementById('praias-cards-grid');
    const regionButtons = document.querySelectorAll('#map-region-filters .filter-pill');
    const locationBox = document.getElementById('selected-location');
    const coordsSpan = document.getElementById('location-coords');
    const addBeachForm = document.getElementById('add-beach-form');

    // Botões de Ação do Mapa
    const btnToggleDraw = document.getElementById('btn-toggle-draw');
    const btnToggleTiles = document.getElementById('btn-toggle-tiles');
    const btnResetMap = document.getElementById('btn-reset-map');
    const layerIcon = document.getElementById('layer-icon');
    const layerText = document.getElementById('layer-text');
    const drawBanner = document.getElementById('draw-active-banner');
    const btnFinishArea = document.getElementById('btn-finish-area');
    const btnClearDraw = document.getElementById('btn-clear-draw');
    const btnCancelDraw = document.getElementById('btn-cancel-draw');
    const btnUndoDraw = document.getElementById('btn-undo-draw');
    const drawVertexCount = document.getElementById('draw-vertex-count');
    const drawModeTitle = document.getElementById('draw-mode-title');
    const drawInstructions = document.getElementById('draw-instructions');
    const submodeSandStrip = document.getElementById('submode-sand-strip');
    const submodePolygon = document.getElementById('submode-polygon');
    const submodeFreehand = document.getElementById('submode-freehand');
    const sandWidthToolbar = document.getElementById('sand-width-toolbar');
    const sandWidthSlider = document.getElementById('sand-width-slider');
    const sandWidthVal = document.getElementById('sand-width-val');
    const sandQuickWidthBtns = document.querySelectorAll('.sand-quick-width');
    const sandLengthBadge = document.getElementById('sand-length-badge');
    const sandLengthVal = document.getElementById('sand-length-val');

    // Elementos do Modal de Ação da Área
    const areaTargetSelect = document.getElementById('area-target-praia');
    const btnConfirmLinkPraia = document.getElementById('btn-confirm-link-praia');
    const btnCreateNewWithArea = document.getElementById('btn-create-new-with-area');

    // Estado da Aplicação
    let praias = typeof PRAIAS_DATA !== 'undefined' ? [...PRAIAS_DATA] : [];
    let currentRegion = 'todas';
    let selectedPraiaId = null;
    let isDrawingMode = false;
    let currentTileMode = 'voyager'; // 'voyager' | 'satellite'

    // Estado do Desenho e Demarcação Personalizável da Faixa de Areia
    let drawSubmode = 'sand-strip'; // 'sand-strip' | 'polygon' | 'freehand'
    let sandWidthMeters = 35;
    let isFreehandDrawing = false;
    let drawnPoints = [];
    let drawnMarkers = [];
    let livePolygon = null;
    let liveLine = null;
    let lastFinalizedArea = null;

    window.lastMapClickedGeo = { lat: -23.4715, lng: -45.0685 };

    // ==================== CONFIGURAÇÃO DO MAPA LEAFLET RESTPOSTO A UBATUBA ====================
    // Bounding Box estrito do município de Ubatuba (SP)
    // Sudoeste: Maranduba / divisa com Caraguatatuba | Nordeste: Camburi / divisa com Paraty
    const UBATUBA_BOUNDS = L.latLngBounds(
        [-23.6300, -45.3800], // Sudoeste
        [-23.2300, -44.7000]  // Nordeste
    );

    // Centro e Zoom ajustados para a vista panorâmica de Ubatuba idêntica ao Google Maps (Imagem 2)
    const UBATUBA_CENTER = [-23.4450, -45.0750];

    // Inicialização da instância Leaflet com suporte a zoom fracionário
    const map = L.map('ubatuba-leaflet-map', {
        center: UBATUBA_CENTER,
        zoom: 11.5,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        minZoom: 11, // IMPEDE O ZOOM OUT PARA FORA DE UBATUBA (Não vai pro Brasil/Mundo)
        maxZoom: 18,
        maxBounds: UBATUBA_BOUNDS, // Restringe a navegação estritamente ao município
        maxBoundsViscosity: 1.0,   // Bloqueio rígido: rebote imediato caso o usuário tente arrastar para fora
        zoomControl: true,
        attributionControl: false
    });

    // ==================== CAMADAS GOOGLE MAPS (SEM WATERMARK / SEM API KEY) ====================
    // 1. Google Relevo / Terreno (lyrs=p) - IDÊNTICO À SEGUNDA IMAGEM DO USUÁRIO
    const googleTerrainTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    // 2. Google Estrada / Ruas (lyrs=m)
    const googleRoadmapTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    // 3. Google Satélite Híbrido com Rótulos de Praias e Vias (lyrs=y)
    const googleSatelliteTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    // Camada padrão: Google Maps Relevo / Terreno (como na Imagem 2 do usuário)
    googleTerrainTiles.addTo(map);
    let currentMapLayer = googleTerrainTiles;

    // Grupos de Camadas para Praias
    const beachPolygonsLayer = L.layerGroup().addTo(map);
    const beachMarkersLayer = L.layerGroup().addTo(map);
    const drawLayer = L.layerGroup().addTo(map);

    // Ajusta o tamanho caso o container mude
    setTimeout(() => map.invalidateSize(), 200);

    // ==================== PALETAS POR REGIÃO ====================
    const REGION_PALETTES = {
        norte:  { color: '#059669', fillColor: '#10b981', name: 'Região Norte' },
        centro: { color: '#d97706', fillColor: '#f59e0b', name: 'Centro de Ubatuba' },
        sul:    { color: '#0284c7', fillColor: '#38bdf8', name: 'Região Sul' },
        ilhas:  { color: '#7c3aed', fillColor: '#a855f7', name: 'Ilha Preservada' }
    };

    // ==================== GERAÇÃO AUTOMÁTICA DE POLÍGONOS DE ÁREA ====================
    // Se a praia não tiver polígono manual, gera uma área costeira circular realista (raio ~280m)
    function generateCirclePolygon(centerLat, centerLng, radiusKm = 0.28, points = 10) {
        const poly = [];
        const earthRadiusKm = 6371;
        const dLat = (radiusKm / earthRadiusKm) * (180 / Math.PI);
        const dLng = (radiusKm / (earthRadiusKm * Math.cos(Math.PI * centerLat / 180))) * (180 / Math.PI);

        for (let i = 0; i < points; i++) {
            const angle = (i * 2 * Math.PI) / points;
            const lat = centerLat + (dLat * Math.sin(angle));
            const lng = centerLng + (dLng * Math.cos(angle));
            poly.push([Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
        }
        return poly;
    }

    // ==================== RENDERIZAÇÃO DAS ÁREAS DE PRAIAS ====================
    function renderBeachAreas() {
        beachPolygonsLayer.clearLayers();
        beachMarkersLayer.clearLayers();

        const filtered = praias.filter(p => currentRegion === 'todas' || p.region === currentRegion);

        filtered.forEach(praia => {
            const palette = REGION_PALETTES[praia.region] || REGION_PALETTES.centro;
            const coords = (praia.coords && Array.isArray(praia.coords) && praia.coords.length === 2) 
                ? praia.coords 
                : [-23.4332, -45.0750];

            // Obtém ou calcula a área poligonal da praia
            const area = (praia.areaCoords && Array.isArray(praia.areaCoords) && praia.areaCoords.length >= 3)
                ? praia.areaCoords
                : generateCirclePolygon(coords[0], coords[1]);

            // 1. Cria o Polígono Interativo da Área da Praia
            const isSelected = selectedPraiaId === praia.id;
            const polygon = L.polygon(area, {
                color: isSelected ? '#23211D' : palette.color,
                fillColor: isSelected ? '#23211D' : palette.fillColor,
                fillOpacity: isSelected ? 0.65 : 0.35,
                weight: isSelected ? 3.5 : 2,
                dashArray: isSelected ? null : '2, 3',
                className: `beach-area-polygon ${isSelected ? 'active' : ''}`
            });

            // Tooltip no Hover da Área
            polygon.bindTooltip(`
                <div style="font-size: 0.82rem; line-height: 1.3;">
                    <strong style="display:block; font-size: 0.88rem;">${praia.name}</strong>
                    <span style="opacity: 0.85;">${palette.name} • Clique para ir à praia</span>
                </div>
            `, {
                sticky: true,
                className: 'beach-area-tooltip'
            });

            // Efeitos de Hover
            polygon.on('mouseover', () => {
                if (selectedPraiaId !== praia.id) {
                    polygon.setStyle({
                        fillOpacity: 0.65,
                        weight: 3,
                        color: '#23211D'
                    });
                }
            });

            polygon.on('mouseout', () => {
                if (selectedPraiaId !== praia.id) {
                    polygon.setStyle({
                        color: palette.color,
                        fillColor: palette.fillColor,
                        fillOpacity: 0.35,
                        weight: 2
                    });
                }
            });

            // CLIQUE NA ÁREA DA PRAIA: SELECIONA E PERMITE REDIRECIONAR IMEDIATAMENTE
            polygon.on('click', (e) => {
                if (isDrawingMode) return; // Se estiver desenhando, ignora seleção
                L.DomEvent.stopPropagation(e);
                selectPraia(praia.id, true);
            });

            // DUPLO-CLIQUE NA ÁREA DA PRAIA: REDIRECIONA DIRETO PARA A PÁGINA DA PRAIA!
            polygon.on('dblclick', (e) => {
                if (isDrawingMode) return;
                L.DomEvent.stopPropagation(e);
                window.location.href = `praia.html?id=${praia.id}`;
            });

            polygon.addTo(beachPolygonsLayer);

            // 2. Marcador Central com Ícone e Rótulo
            const iconGlyph = praia.region === 'ilhas' ? '🏝️' : (praia.tags && praia.tags.includes('Surf') ? '🏄' : '🏖️');
            
            const customIcon = L.divIcon({
                className: 'beach-custom-marker',
                html: `
                    <div class="beach-marker-wrapper ${isSelected ? 'active' : ''}" id="marker-${praia.id}">
                        <div class="beach-marker-pin" style="background-color: ${palette.color};">
                            <span>${iconGlyph}</span>
                        </div>
                        <div class="beach-marker-label">${praia.name}</div>
                    </div>
                `,
                iconSize: [80, 50],
                iconAnchor: [40, 48]
            });

            const marker = L.marker(coords, { icon: customIcon });

            marker.on('click', (e) => {
                if (isDrawingMode) return;
                L.DomEvent.stopPropagation(e);
                selectPraia(praia.id, true);
            });

            marker.addTo(beachMarkersLayer);
        });
    }

    // ==================== SELEÇÃO DE PRAIA & REDIRECIONAMENTO ====================
    function selectPraia(praiaId, panTo = true) {
        const praia = praias.find(p => p.id === praiaId);
        if (!praia) return;

        selectedPraiaId = praiaId;

        // Atualiza estilo dos polígonos e marcadores
        renderBeachAreas();

        // Atualiza o dropdown seletor
        if (manualSelect && manualSelect.value !== praiaId) {
            manualSelect.value = praiaId;
        }

        // Move a câmera para a praia selecionada
        if (panTo && praia.coords) {
            map.flyTo(praia.coords, Math.max(map.getZoom(), 14), {
                duration: 0.8
            });
        }

        // Preenche o Card Flutuante de Preview
        const coverImage = (praia.images && praia.images[0]) 
            ? praia.images[0].url 
            : 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80';

        const palette = REGION_PALETTES[praia.region] || REGION_PALETTES.centro;
        const accessTxt = (praia.access && praia.access.tipo) ? praia.access.tipo.split('e')[0] : 'Fácil Acesso';
        const parkingTxt = (praia.parking && praia.parking.status) ? praia.parking.status.split('(')[0] : 'Vagas na orla';

        if (cardInnerContent) {
            cardInnerContent.innerHTML = `
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <img src="${coverImage}" alt="${praia.name}" style="width: 110px; height: 100px; object-fit: cover; border-radius: 12px; flex-shrink: 0; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                            <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: ${palette.color}; font-weight: 700;">
                                ● ${palette.name}
                            </span>
                            <span style="font-size: 0.72rem; background: rgba(0,0,0,0.06); padding: 2px 7px; border-radius: 999px; color: var(--text-muted);">
                                Área Demarcada
                            </span>
                        </div>
                        <h3 style="font-family: var(--font-serif); font-size: 1.3rem; margin: 3px 0 5px; color: var(--text-primary); font-weight: 600; line-height: 1.2;">
                            ${praia.name}
                        </h3>
                        <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.35; margin: 0 0 6px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                            ${praia.shortDesc || praia.subtitle || 'Bela praia no litoral de Ubatuba.'}
                        </p>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 0.75rem; color: var(--text-primary); font-weight: 600;">
                            <span>🚗 ${accessTxt}</span>
                            <span>🅿️ ${parkingTxt}</span>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 0.6rem;">
                    <!-- Botão de Acesso Imediato com Redirecionamento -->
                    <a href="praia.html?id=${praia.id}" class="btn-pill" style="flex: 1; text-align: center; padding: 0.7rem 1rem; font-size: 0.85rem; text-decoration: none; background: var(--olive-btn); color: #fff; font-weight: 600; box-shadow: 0 4px 12px rgba(120,96,28,0.25);">
                        👉 Visitar Página da Praia &rarr;
                    </a>
                    <a href="praias.html" class="btn-pill" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); padding: 0.7rem 1rem; font-size: 0.82rem; text-decoration: none;">
                        Ver Catálogo (100+)
                    </a>
                </div>
            `;
        }

        if (floatingCard) floatingCard.classList.add('active');
    }

    window.closeMapCard = () => {
        if (floatingCard) floatingCard.classList.remove('active');
        selectedPraiaId = null;
        renderBeachAreas();
        if (manualSelect) manualSelect.value = '';
    };

    // ==================== FERRAMENTA: DEMARCAR / SELECIONAR ÁREA DE PRAIA ====================
    function setDrawingMode(active) {
        isDrawingMode = active;

        if (active) {
            document.body.classList.add('draw-mode-active');
            if (btnToggleDraw) {
                btnToggleDraw.classList.add('active');
                const btnText = document.getElementById('draw-btn-text');
                if (btnText) btnText.textContent = 'Demarcando Área...';
            }
            if (drawBanner) drawBanner.style.display = 'block';
            window.closeMapCard();
            clearDrawnArea();
        } else {
            document.body.classList.remove('draw-mode-active');
            if (btnToggleDraw) {
                btnToggleDraw.classList.remove('active');
                const btnText = document.getElementById('draw-btn-text');
                if (btnText) btnText.textContent = 'Demarcar Área de Praia';
            }
            if (drawBanner) drawBanner.style.display = 'none';
            clearDrawnArea();
        }
    }

    window.cancelDrawingMode = () => setDrawingMode(false);

    // ==================== CÁLCULO DA FAIXA DE AREIA (CORREDOR COSTEIRO) ====================
    function computeSandStripPolygon(points, widthMeters) {
        if (!points || points.length < 2) return null;

        const halfWidth = widthMeters / 2;
        const midLat = points[0][0];
        const latRad = midLat * (Math.PI / 180);
        const mPerDegLat = 111132.954;
        const mPerDegLng = 111412.84 * Math.cos(latRad);

        const ptsMeters = points.map(p => ({
            x: p[1] * mPerDegLng,
            y: p[0] * mPerDegLat
        }));

        const n = ptsMeters.length;
        const leftMeters = [];
        const rightMeters = [];

        for (let i = 0; i < n; i++) {
            let tx = 0, ty = 0;
            if (i === 0) {
                tx = ptsMeters[1].x - ptsMeters[0].x;
                ty = ptsMeters[1].y - ptsMeters[0].y;
            } else if (i === n - 1) {
                tx = ptsMeters[n - 1].x - ptsMeters[n - 2].x;
                ty = ptsMeters[n - 1].y - ptsMeters[n - 2].y;
            } else {
                const v1x = ptsMeters[i].x - ptsMeters[i - 1].x;
                const v1y = ptsMeters[i].y - ptsMeters[i - 1].y;
                const l1 = Math.hypot(v1x, v1y) || 1;
                const v2x = ptsMeters[i + 1].x - ptsMeters[i].x;
                const v2y = ptsMeters[i + 1].y - ptsMeters[i].y;
                const l2 = Math.hypot(v2x, v2y) || 1;
                tx = (v1x / l1) + (v2x / l2);
                ty = (v1y / l1) + (v2y / l2);
            }

            const len = Math.hypot(tx, ty) || 1;
            const ux = tx / len;
            const uy = ty / len;
            const nx = -uy;
            const ny = ux;

            leftMeters.push({
                x: ptsMeters[i].x + nx * halfWidth,
                y: ptsMeters[i].y + ny * halfWidth
            });
            rightMeters.push({
                x: ptsMeters[i].x - nx * halfWidth,
                y: ptsMeters[i].y - ny * halfWidth
            });
        }

        const leftCoords = leftMeters.map(m => [
            Number((m.y / mPerDegLat).toFixed(6)),
            Number((m.x / mPerDegLng).toFixed(6))
        ]);

        const rightCoords = rightMeters.map(m => [
            Number((m.y / mPerDegLat).toFixed(6)),
            Number((m.x / mPerDegLng).toFixed(6))
        ]);

        return [...leftCoords, ...rightCoords.reverse()];
    }

    function computePolylineLength(points) {
        if (!points || points.length < 2) return 0;
        const midLat = points[0][0];
        const latRad = midLat * (Math.PI / 180);
        const mPerDegLat = 111132.954;
        const mPerDegLng = 111412.84 * Math.cos(latRad);
        let total = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const dx = (points[i+1][1] - points[i][1]) * mPerDegLng;
            const dy = (points[i+1][0] - points[i][0]) * mPerDegLat;
            total += Math.hypot(dx, dy);
        }
        return Math.round(total);
    }

    function computePolygonCentroid(pts) {
        if (!pts || pts.length === 0) return [-23.4450, -45.0750];
        const avgLat = pts.reduce((acc, p) => acc + p[0], 0) / pts.length;
        const avgLng = pts.reduce((acc, p) => acc + p[1], 0) / pts.length;
        return [Number(avgLat.toFixed(6)), Number(avgLng.toFixed(6))];
    }

    function clearDrawnArea() {
        drawnPoints = [];
        drawnMarkers.forEach(m => drawLayer.removeLayer(m));
        drawnMarkers = [];
        if (livePolygon) {
            drawLayer.removeLayer(livePolygon);
            livePolygon = null;
        }
        if (liveLine) {
            drawLayer.removeLayer(liveLine);
            liveLine = null;
        }
        if (drawVertexCount) drawVertexCount.textContent = '0';
        if (btnFinishArea) btnFinishArea.disabled = true;
        if (btnUndoDraw) btnUndoDraw.disabled = true;
        if (sandLengthVal) sandLengthVal.textContent = '0m';
    }

    function updateDrawnVisuals() {
        if (drawVertexCount) drawVertexCount.textContent = drawnPoints.length;
        if (btnUndoDraw) btnUndoDraw.disabled = (drawnPoints.length === 0);

        if (drawSubmode === 'sand-strip' || drawSubmode === 'freehand') {
            if (drawnPoints.length >= 2) {
                const ribbon = computeSandStripPolygon(drawnPoints, sandWidthMeters);
                const len = computePolylineLength(drawnPoints);
                if (sandLengthVal) sandLengthVal.textContent = `${len}m`;
                if (btnFinishArea) btnFinishArea.disabled = false;

                if (livePolygon) {
                    livePolygon.setLatLngs(ribbon);
                } else {
                    livePolygon = L.polygon(ribbon, {
                        color: '#d97706',
                        fillColor: '#f59e0b',
                        fillOpacity: 0.42,
                        weight: 2.5,
                        dashArray: '3, 4'
                    }).addTo(drawLayer);
                }

                if (liveLine) {
                    liveLine.setLatLngs(drawnPoints);
                } else {
                    liveLine = L.polyline(drawnPoints, {
                        color: '#fef08a',
                        weight: 2,
                        dashArray: '4, 4'
                    }).addTo(drawLayer);
                }
            } else {
                if (livePolygon) { drawLayer.removeLayer(livePolygon); livePolygon = null; }
                if (liveLine) { drawLayer.removeLayer(liveLine); liveLine = null; }
                if (sandLengthVal) sandLengthVal.textContent = '0m';
                if (btnFinishArea) btnFinishArea.disabled = true;
            }
        } else if (drawSubmode === 'polygon') {
            if (drawnPoints.length >= 3) {
                if (btnFinishArea) btnFinishArea.disabled = false;
                const perimeter = computePolylineLength([...drawnPoints, drawnPoints[0]]);
                if (sandLengthVal) sandLengthVal.textContent = `${perimeter}m (perímetro)`;

                if (livePolygon) {
                    livePolygon.setLatLngs(drawnPoints);
                } else {
                    if (liveLine) { drawLayer.removeLayer(liveLine); liveLine = null; }
                    livePolygon = L.polygon(drawnPoints, {
                        color: '#ef4444',
                        fillColor: '#f87171',
                        fillOpacity: 0.45,
                        weight: 2.5,
                        dashArray: '4, 4'
                    }).addTo(drawLayer);
                }
            } else if (drawnPoints.length === 2) {
                if (btnFinishArea) btnFinishArea.disabled = true;
                const len = computePolylineLength(drawnPoints);
                if (sandLengthVal) sandLengthVal.textContent = `${len}m`;
                if (livePolygon) { drawLayer.removeLayer(livePolygon); livePolygon = null; }
                if (liveLine) {
                    liveLine.setLatLngs(drawnPoints);
                } else {
                    liveLine = L.polyline(drawnPoints, {
                        color: '#ef4444',
                        weight: 2.5,
                        dashArray: '4, 4'
                    }).addTo(drawLayer);
                }
            } else {
                if (livePolygon) { drawLayer.removeLayer(livePolygon); livePolygon = null; }
                if (liveLine) { drawLayer.removeLayer(liveLine); liveLine = null; }
                if (btnFinishArea) btnFinishArea.disabled = true;
                if (sandLengthVal) sandLengthVal.textContent = '0m';
            }
        }
    }

    function reindexMarkers() {
        drawnMarkers.forEach((marker, idx) => {
            marker.off('drag');
            marker.off('click');
            marker.on('drag', (e) => {
                const pos = e.target.getLatLng();
                drawnPoints[idx] = [Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6))];
                updateDrawnVisuals();
            });
            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                removeVertex(idx);
            });
        });
    }

    function removeVertex(idx) {
        if (idx < 0 || idx >= drawnPoints.length) return;
        drawnPoints.splice(idx, 1);
        const m = drawnMarkers.splice(idx, 1)[0];
        if (m) drawLayer.removeLayer(m);
        reindexMarkers();
        updateDrawnVisuals();
    }

    function addVertex(lat, lng) {
        const idx = drawnPoints.length;
        drawnPoints.push([lat, lng]);

        const isSandMode = (drawSubmode === 'sand-strip' || drawSubmode === 'freehand');
        const iconClass = isSandMode ? 'sand-center-handle' : 'sand-vertex-handle';
        const tipText = isSandMode 
            ? 'Arraste para ajustar à curvatura da areia • Clique para remover' 
            : 'Arraste para ajustar • Clique para remover';

        const handle = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'draw-vertex-marker-wrap',
                html: `<div class="${iconClass}" title="${tipText}"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            }),
            draggable: true
        }).addTo(drawLayer);

        handle.on('drag', (e) => {
            const pos = e.target.getLatLng();
            drawnPoints[idx] = [Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6))];
            updateDrawnVisuals();
        });

        handle.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            removeVertex(idx);
        });

        drawnMarkers.push(handle);
        reindexMarkers();
        updateDrawnVisuals();
    }

    // Submodos de Demarcação
    function setDrawSubmode(mode) {
        drawSubmode = mode;
        [submodeSandStrip, submodePolygon, submodeFreehand].forEach(b => {
            if (b) b.classList.remove('active');
        });

        if (mode === 'sand-strip') {
            if (submodeSandStrip) submodeSandStrip.classList.add('active');
            if (drawModeTitle) drawModeTitle.textContent = 'Demarcação da Faixa de Areia';
            if (drawInstructions) drawInstructions.textContent = 'Clique ao longo da orla para traçar a faixa de areia. Arraste qualquer ponto para ajustar e defina a largura abaixo.';
            if (sandWidthToolbar) sandWidthToolbar.style.display = 'flex';
        } else if (mode === 'polygon') {
            if (submodePolygon) submodePolygon.classList.add('active');
            if (drawModeTitle) drawModeTitle.textContent = 'Polígono Detalhado da Praia';
            if (drawInstructions) drawInstructions.textContent = 'Clique nos limites da areia para criar o polígono. Arraste os pontos para refinar cada canto.';
            if (sandWidthToolbar) sandWidthToolbar.style.display = 'none';
        } else if (mode === 'freehand') {
            if (submodeFreehand) submodeFreehand.classList.add('active');
            if (drawModeTitle) drawModeTitle.textContent = 'Desenho Livre (Pincel de Areia)';
            if (drawInstructions) drawInstructions.textContent = 'Mantenha o botão do mouse pressionado e arraste livremente sobre a areia da praia.';
            if (sandWidthToolbar) sandWidthToolbar.style.display = 'flex';
        }
        updateDrawnVisuals();
    }

    if (submodeSandStrip) submodeSandStrip.addEventListener('click', () => setDrawSubmode('sand-strip'));
    if (submodePolygon) submodePolygon.addEventListener('click', () => setDrawSubmode('polygon'));
    if (submodeFreehand) submodeFreehand.addEventListener('click', () => setDrawSubmode('freehand'));

    // Controle de Largura da Areia (Slider e Botões Rápidos)
    if (sandWidthSlider) {
        sandWidthSlider.addEventListener('input', (e) => {
            sandWidthMeters = Number(e.target.value);
            if (sandWidthVal) sandWidthVal.textContent = `${sandWidthMeters}m`;
            sandQuickWidthBtns.forEach(btn => {
                btn.classList.toggle('active', Number(btn.getAttribute('data-width')) === sandWidthMeters);
            });
            updateDrawnVisuals();
        });
    }

    sandQuickWidthBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const w = Number(btn.getAttribute('data-width'));
            sandWidthMeters = w;
            if (sandWidthSlider) sandWidthSlider.value = w;
            if (sandWidthVal) sandWidthVal.textContent = `${w}m`;
            sandQuickWidthBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateDrawnVisuals();
        });
    });

    if (btnUndoDraw) {
        btnUndoDraw.addEventListener('click', () => {
            if (drawnPoints.length > 0) {
                removeVertex(drawnPoints.length - 1);
            }
        });
    }

    // Clique no mapa durante o modo de desenho
    map.on('click', (e) => {
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));

        window.lastMapClickedGeo = { lat, lng };
        if (locationBox && coordsSpan) {
            locationBox.style.display = 'block';
            coordsSpan.textContent = `Lat: ${lat}, Lng: ${lng}`;
            const linkCadastrar = document.getElementById('link-cadastrar-coords');
            if (linkCadastrar) {
                linkCadastrar.href = `cadastrar-praia.html?lat=${lat}&lng=${lng}`;
            }
        }

        if (!isDrawingMode) {
            window.closeMapCard();
            return;
        }

        if (drawSubmode === 'freehand') return; // no modo freehand usamos mouse drag

        addVertex(lat, lng);
    });

    // Suporte a Desenho Livre (Arrastar com o mouse)
    map.on('mousedown', (e) => {
        if (!isDrawingMode || drawSubmode !== 'freehand') return;
        isFreehandDrawing = true;
        clearDrawnArea();
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));
        addVertex(lat, lng);
    });

    map.on('mousemove', (e) => {
        if (!isDrawingMode || drawSubmode !== 'freehand' || !isFreehandDrawing) return;
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));
        if (drawnPoints.length > 0) {
            const last = drawnPoints[drawnPoints.length - 1];
            const dLat = (lat - last[0]) * 111132;
            const dLng = (lng - last[1]) * 102000;
            if (Math.hypot(dLat, dLng) >= 12) {
                addVertex(lat, lng);
            }
        }
    });

    map.on('mouseup', () => {
        if (isFreehandDrawing) {
            isFreehandDrawing = false;
        }
    });

    // Duplo clique no mapa finaliza a demarcação se tiver pontos suficientes
    map.on('dblclick', (e) => {
        if (isDrawingMode && drawnPoints.length >= 2) {
            L.DomEvent.stopPropagation(e);
            finishAreaDemarcation();
        }
    });

    // Finalização da Área Demarcada
    function finishAreaDemarcation() {
        if (drawnPoints.length === 0) return;

        let finalAreaCoords = [];
        let centerCoords = [];

        if (drawSubmode === 'sand-strip' || drawSubmode === 'freehand') {
            if (drawnPoints.length >= 2) {
                finalAreaCoords = computeSandStripPolygon(drawnPoints, sandWidthMeters);
                centerCoords = computePolygonCentroid(finalAreaCoords);
            } else {
                finalAreaCoords = generateCirclePolygon(drawnPoints[0][0], drawnPoints[0][1], 0.04, 12);
                centerCoords = drawnPoints[0];
            }
        } else if (drawSubmode === 'polygon') {
            if (drawnPoints.length >= 3) {
                finalAreaCoords = [...drawnPoints];
                centerCoords = computePolygonCentroid(finalAreaCoords);
            } else if (drawnPoints.length === 2) {
                finalAreaCoords = computeSandStripPolygon(drawnPoints, sandWidthMeters);
                centerCoords = computePolygonCentroid(finalAreaCoords);
            } else {
                finalAreaCoords = generateCirclePolygon(drawnPoints[0][0], drawnPoints[0][1], 0.04, 12);
                centerCoords = drawnPoints[0];
            }
        }

        lastFinalizedArea = {
            points: finalAreaCoords,
            center: centerCoords,
            rawPoints: drawnPoints,
            width: sandWidthMeters,
            mode: drawSubmode
        };

        // Popula o select de praias no modal de vinculação
        if (areaTargetSelect) {
            areaTargetSelect.innerHTML = '<option value="">Selecione uma praia existente...</option>' + 
                praias.map(p => `<option value="${p.id}">${p.name} (${p.region.toUpperCase()})</option>`).join('');
        }

        // Abre o modal de escolha da área demarcada
        window.openAreaModal(lastFinalizedArea);

        // Desativa o modo de desenho
        setDrawingMode(false);
    }

    // Botões do Banner de Demarcação
    if (btnToggleDraw) {
        btnToggleDraw.addEventListener('click', () => {
            setDrawingMode(!isDrawingMode);
        });
    }

    if (btnFinishArea) {
        btnFinishArea.addEventListener('click', finishAreaDemarcation);
    }

    if (btnClearDraw) {
        btnClearDraw.addEventListener('click', clearDrawnArea);
    }

    if (btnCancelDraw) {
        btnCancelDraw.addEventListener('click', () => setDrawingMode(false));
    }

    // ==================== AÇÕES DO MODAL DE ÁREA DEMARCADA ====================
    // Ação 1: Vincular a uma praia existente e REDIRECIONAR IMEDIATAMENTE
    if (btnConfirmLinkPraia) {
        btnConfirmLinkPraia.addEventListener('click', async () => {
            const targetId = areaTargetSelect ? areaTargetSelect.value : '';
            if (!targetId) {
                alert('Por favor, selecione uma praia na lista para vincular esta área.');
                return;
            }

            if (!lastFinalizedArea || !lastFinalizedArea.points) {
                alert('Nenhuma área válida foi selecionada.');
                return;
            }

            btnConfirmLinkPraia.disabled = true;
            btnConfirmLinkPraia.textContent = 'Salvando e Redirecionando...';

            try {
                // Tenta atualizar no backend via API
                const res = await fetch(`${API_URL}/praias/${targetId}/area`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        coords: lastFinalizedArea.center,
                        areaCoords: lastFinalizedArea.points
                    })
                });

                // Atualiza também em memória local
                const idx = praias.findIndex(p => p.id === targetId);
                if (idx !== -1) {
                    praias[idx].areaCoords = lastFinalizedArea.points;
                    praias[idx].coords = lastFinalizedArea.center;
                }

                window.closeAreaModal();
                
                // REDIRECIONAMENTO IMEDIATO PARA A PÁGINA DA PRAIA ESCOLHIDA
                window.location.href = `praia.html?id=${targetId}`;
            } catch (err) {
                console.error('Erro ao vincular área:', err);
                // Mesmo se a API falhar, redireciona para a praia
                window.location.href = `praia.html?id=${targetId}`;
            }
        });
    }

    // Ação 2: Cadastrar nova praia com a área demarcada
    if (btnCreateNewWithArea) {
        btnCreateNewWithArea.addEventListener('click', () => {
            window.closeAreaModal();
            if (lastFinalizedArea) {
                window.openAddBeachModal({
                    coords: lastFinalizedArea.center,
                    areaCoords: lastFinalizedArea.points
                });
            } else {
                window.openAddBeachModal();
            }
        });
    }

    // ==================== ALTERNADOR DE CAMADAS GOOGLE MAPS ====================
    function switchMapLayer(type) {
        if (currentMapLayer) map.removeLayer(currentMapLayer);

        if (type === 'terrain') {
            currentMapLayer = googleTerrainTiles;
        } else if (type === 'roadmap') {
            currentMapLayer = googleRoadmapTiles;
        } else if (type === 'satellite') {
            currentMapLayer = googleSatelliteTiles;
        } else {
            currentMapLayer = googleTerrainTiles;
        }

        currentMapLayer.addTo(map);

        // Atualiza abas do widget do Google Maps
        document.querySelectorAll('.google-btn-tab').forEach(btn => {
            if (btn.getAttribute('data-map-type') === type) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Atualiza botão da barra superior
        if (layerIcon && layerText) {
            if (type === 'satellite') {
                layerIcon.textContent = '⛰️';
                layerText.textContent = 'Relevo';
            } else if (type === 'terrain') {
                layerIcon.textContent = '🛰️';
                layerText.textContent = 'Satélite';
            } else {
                layerIcon.textContent = '⛰️';
                layerText.textContent = 'Relevo';
            }
        }
    }

    // Eventos de clique nas abas do Google Maps widget
    document.querySelectorAll('.google-btn-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-map-type');
            switchMapLayer(type);
        });
    });

    // Botão alternador da barra de ferramentas
    if (btnToggleTiles) {
        btnToggleTiles.addEventListener('click', () => {
            const isCurrentlySat = currentMapLayer === googleSatelliteTiles;
            switchMapLayer(isCurrentlySat ? 'terrain' : 'satellite');
        });
    }

    // ==================== RECENTRALIZAR EM UBATUBA ====================
    if (btnResetMap) {
        btnResetMap.addEventListener('click', () => {
            map.flyToBounds(UBATUBA_BOUNDS, {
                padding: [20, 20],
                duration: 1.0
            });
            window.closeMapCard();
        });
    }

    // ==================== POPULAÇÃO DO SELETOR DE PRAIAS ====================
    function populateSelect() {
        if (!manualSelect) return;
        const currentVal = manualSelect.value;
        manualSelect.innerHTML = '<option value="">🔍 Buscar praia no mapa...</option>';
        praias.forEach(praia => {
            const opt = document.createElement('option');
            opt.value = praia.id;
            opt.textContent = `${praia.name} (${praia.region.toUpperCase()})`;
            manualSelect.appendChild(opt);
        });
        if (currentVal) manualSelect.value = currentVal;
    }

    if (manualSelect) {
        manualSelect.addEventListener('change', (e) => {
            const selectedId = e.target.value;
            if (selectedId) {
                selectPraia(selectedId, true);
            } else {
                window.closeMapCard();
            }
        });
    }

    // ==================== FILTROS POR REGIÃO ====================
    const REGION_BOUNDS = {
        norte:  L.latLngBounds([[-23.4250, -45.0450], [-23.3300, -44.8200]]),
        centro: L.latLngBounds([[-23.4900, -45.1050], [-23.4350, -45.0200]]),
        sul:    L.latLngBounds([[-23.5600, -45.2500], [-23.4900, -45.1100]]),
        ilhas:  L.latLngBounds([[-23.5500, -45.0900], [-23.4100, -44.8500]])
    };

    regionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            regionButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentRegion = btn.getAttribute('data-region');
            
            renderBeachAreas();
            window.closeMapCard();

            // Voa suavemente para a região em Ubatuba
            if (currentRegion === 'todas') {
                map.flyToBounds(UBATUBA_BOUNDS, { padding: [20, 20], duration: 1.0 });
            } else if (REGION_BOUNDS[currentRegion]) {
                map.flyToBounds(REGION_BOUNDS[currentRegion], { padding: [30, 30], duration: 1.0 });
            }
        });
    });

    // ==================== GRADE DE CARDS INFERIOR ====================
    function renderCardsGrid() {
        if (!cardsGrid) return;
        cardsGrid.innerHTML = praias.map(praia => {
            const coverImage = (praia.images && praia.images[0]) 
                ? praia.images[0].url 
                : 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80';
            
            const accessShort = (praia.access && praia.access.tipo) ? praia.access.tipo.split('e')[0] : 'Fácil Acesso';

            return `
                <a href="praia.html?id=${praia.id}" class="praia-preview-card" title="${praia.name}">
                    <img src="${coverImage}" alt="${praia.name}" loading="lazy">
                    <div class="preview-content">
                        <h4>${praia.name}</h4>
                        <p>${praia.shortDesc || praia.subtitle || 'Uma das praias mais encantadoras de Ubatuba.'}</p>
                        <div class="preview-footer">
                            <span class="preview-badge">🚗 ${accessShort}</span>
                            <span class="preview-link">Ver detalhes &rarr;</span>
                        </div>
                    </div>
                </a>
            `;
        }).join('');
    }

    // ==================== BUSCA PRAIAS NA API EM SEGUNDO PLANO ====================
    async function fetchPraias() {
        try {
            const res = await fetch(`${API_URL}/praias`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    praias = data;
                    renderBeachAreas();
                    populateSelect();
                    renderCardsGrid();
                }
            }
        } catch (e) {
            console.warn('API indisponível, usando dados locais.');
        }
    }

    // ==================== SUBMISSÃO DO FORMULÁRIO DE CADASTRO ====================
    if (addBeachForm) {
        addBeachForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = addBeachForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.textContent : 'Salvar';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Salvando praia...';
            }

            const name = document.getElementById('new-beach-name').value;
            const region = document.getElementById('new-beach-region').value;
            const subtitle = document.getElementById('new-beach-subtitle').value;
            const file = document.getElementById('new-beach-file').files[0];
            const url = document.getElementById('new-beach-url').value;
            const shortDesc = document.getElementById('new-beach-shortdesc').value;
            const fullDesc = document.getElementById('new-beach-fulldesc').value;
            const accessTipo = document.getElementById('new-beach-access-type').value;
            const parkingStatus = document.getElementById('new-beach-parking-status').value;
            
            const latVal = document.getElementById('new-beach-lat').value;
            const lngVal = document.getElementById('new-beach-lng').value;
            const areaVal = document.getElementById('new-beach-area-coords').value;

            const parsedLat = parseFloat(latVal) || (window.lastMapClickedGeo ? window.lastMapClickedGeo.lat : -23.4332);
            const parsedLng = parseFloat(lngVal) || (window.lastMapClickedGeo ? window.lastMapClickedGeo.lng : -45.0750);

            const formData = new FormData();
            formData.append('name', name);
            formData.append('region', region);
            formData.append('subtitle', subtitle);
            formData.append('shortDesc', shortDesc);
            formData.append('fullDesc', fullDesc);
            formData.append('accessTipo', accessTipo);
            formData.append('parkingStatus', parkingStatus);
            formData.append('coords', JSON.stringify([parsedLat, parsedLng]));

            if (areaVal) {
                formData.append('areaCoords', areaVal);
            }

            if (file) {
                formData.append('image', file);
            } else if (url) {
                formData.append('imageUrl', url);
            }

            try {
                const res = await fetch(`${API_URL}/praias`, {
                    method: 'POST',
                    body: formData
                });

                if (res.ok) {
                    const data = await res.json();
                    alert(`✅ A praia "${data.praia.name}" foi cadastrada com sucesso! Redirecionando...`);
                    addBeachForm.reset();
                    window.closeAddBeachModal();
                    
                    // REDIRECIONA IMEDIATAMENTE PARA A NOVA PRAIA
                    window.location.href = `praia.html?id=${data.praia.id}`;
                } else {
                    const data = await res.json();
                    alert(data.error || 'Erro ao cadastrar praia.');
                }
            } catch (err) {
                console.error('Erro ao cadastrar:', err);
                alert('Erro de comunicação com o servidor ao cadastrar nova praia.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        });
    }

    // ==================== INICIALIZAÇÃO INICIAL ====================
    renderBeachAreas();
    populateSelect();
    renderCardsGrid();
    fetchPraias();
});
