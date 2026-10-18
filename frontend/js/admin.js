window.API_URL = window.API_URL || '/api';
var API_URL = window.API_URL;

document.addEventListener('DOMContentLoaded', async () => {
    // Validação de acesso de Admin
    const token = localStorage.getItem('token');
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;

    if (!token || !user || user.role !== 'admin') {
        alert('Acesso restrito! Você precisa estar logado como Administrador para acessar este painel.');
        window.location.href = 'login.html';
        return;
    }

    const selectElement = document.getElementById('praia-select');
    const photosContainer = document.getElementById('admin-current-photos');
    const form = document.getElementById('admin-photo-form');
    const fileInput = document.getElementById('photo-file');
    const urlInput = document.getElementById('photo-url');
    const captionInput = document.getElementById('photo-caption');
    const targetIndexInput = document.getElementById('target-image-index');
    const previewBox = document.getElementById('photo-preview-box');
    const previewImg = document.getElementById('photo-preview-img');
    const formTitle = document.getElementById('form-action-title');
    const formDesc = document.getElementById('form-action-desc');
    const cancelBtn = document.getElementById('btn-cancel-replace');

    let allPraias = [];

    // Carrega dados das praias da API (com fallback se necessário)
    async function fetchPraias() {
        try {
            const res = await fetch(`${API_URL}/praias`);
            if (res.ok) {
                allPraias = await res.json();
            } else {
                allPraias = typeof PRAIAS_DATA !== 'undefined' ? PRAIAS_DATA : [];
            }
        } catch (e) {
            allPraias = typeof PRAIAS_DATA !== 'undefined' ? PRAIAS_DATA : [];
        }
    }

    await fetchPraias();

    // Popula o seletor de praias
    selectElement.innerHTML = allPraias.map(p => `
        <option value="${p.id}">${p.name}</option>
    `).join('');

    // Checa se veio parâmetro na URL (ex: ?praia=praia-do-felix)
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedPraia = urlParams.get('praia');
    if (preselectedPraia && allPraias.some(p => p.id === preselectedPraia)) {
        selectElement.value = preselectedPraia;
    }

    // Renderiza as fotos da praia selecionada
    function renderPraiaPhotos() {
        const selectedId = selectElement.value;
        const praia = allPraias.find(p => p.id === selectedId);

        if (!praia || !praia.images || praia.images.length === 0) {
            photosContainer.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1;">Nenhuma imagem cadastrada para esta praia.</p>';
            return;
        }

        photosContainer.innerHTML = praia.images.map((img, index) => `
            <div class="praia-photo-card" style="position: relative;">
                <span style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.65); color: #fff; font-size: 0.75rem; padding: 2px 8px; border-radius: 9999px; z-index: 2;">
                    Foto #${index + 1}
                </span>
                <img src="${img.url}" alt="${img.caption}" style="height: 200px; width: 100%; object-fit: cover;">
                <div class="photo-caption" style="padding: 0.8rem 1rem;">
                    <strong>${img.caption || 'Sem legenda'}</strong>
                </div>
                <div style="padding: 0.8rem 1rem; display: flex; gap: 0.5rem; border-top: 1px solid var(--border-color); background: var(--bg-secondary);">
                    <button type="button" class="btn-pill" style="flex: 1; padding: 0.35rem 0.8rem; font-size: 0.75rem;" onclick="prepareReplace(${index})">
                        Substituir
                    </button>
                    <button type="button" class="btn-pill" style="padding: 0.35rem 0.8rem; font-size: 0.75rem; background: #e53935;" onclick="deletePhoto(${index})">
                        Excluir
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderPraiaPhotos();

    // ==================== MAPA DE COORDENADAS & ÁREAS DO ADMIN ====================
    const UBATUBA_BOUNDS = L.latLngBounds(
        [-23.6300, -45.3800],
        [-23.2300, -44.7000]
    );

    const latInput = document.getElementById('admin-beach-lat');
    const lngInput = document.getElementById('admin-beach-lng');
    const coordsDisplay = document.getElementById('admin-coords-display');
    const coordsForm = document.getElementById('admin-coords-form');
    const btnSaveCoords = document.getElementById('btn-save-coords');
    const btnAdminTerrain = document.getElementById('btn-admin-terrain');
    const btnAdminSatellite = document.getElementById('btn-admin-satellite');
    const linkTestGoogle = document.getElementById('admin-btn-test-maps');
    const linkTestSite = document.getElementById('admin-btn-test-mapa');

    // Elementos de Demarcação de Área Costeira no Admin
    const btnAdminToggleDraw = document.getElementById('btn-admin-toggle-draw');
    const btnAdminTriggerDraw = document.getElementById('btn-admin-trigger-draw');
    const adminDrawBtnText = document.getElementById('admin-draw-btn-text');
    const adminAreaStatus = document.getElementById('admin-area-status');
    const btnAdminDeleteArea = document.getElementById('btn-admin-delete-area');
    const adminDrawBanner = document.getElementById('admin-draw-banner');
    const adminDrawModeTitle = document.getElementById('admin-draw-mode-title');
    const adminDrawInstructions = document.getElementById('admin-draw-instructions');
    const adminSubmodeSandStrip = document.getElementById('admin-submode-sand-strip');
    const adminSubmodePolygon = document.getElementById('admin-submode-polygon');
    const adminSubmodeFreehand = document.getElementById('admin-submode-freehand');
    const adminBtnUndoDraw = document.getElementById('admin-btn-undo-draw');
    const adminBtnClearDraw = document.getElementById('admin-btn-clear-draw');
    const adminBtnFinishArea = document.getElementById('admin-btn-finish-area');
    const adminBtnCancelDraw = document.getElementById('admin-btn-cancel-draw');
    const adminDrawVertexCount = document.getElementById('admin-draw-vertex-count');
    const adminSandWidthToolbar = document.getElementById('admin-sand-width-toolbar');
    const adminSandWidthSlider = document.getElementById('admin-sand-width-slider');
    const adminSandWidthVal = document.getElementById('admin-sand-width-val');
    const adminSandQuickWidthBtns = document.querySelectorAll('.admin-sand-quick-width');
    const adminSandLengthVal = document.getElementById('admin-sand-length-val');

    let adminMap = null;
    let adminMarker = null;
    let adminAreaPolygon = null;
    let googleTerrainLayer = null;
    let googleSatelliteLayer = null;
    let currentTile = null;

    // Estado da Demarcação de Área no Admin
    let isDrawingMode = false;
    let drawSubmode = 'sand-strip'; // 'sand-strip' | 'polygon' | 'freehand'
    let sandWidthMeters = 35;
    let drawnPoints = [];
    let drawnMarkers = [];
    let drawLayer = null;
    let livePolygon = null;
    let liveLine = null;
    let isFreehandDrawing = false;

    // ==================== CÁLCULOS GEOMÉTRICOS (FAIXA DE AREIA & POLÍGONO) ====================
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
            const dx = (points[i + 1][1] - points[i][1]) * mPerDegLng;
            const dy = (points[i + 1][0] - points[i][0]) * mPerDegLat;
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
        if (drawnMarkers && drawLayer) {
            drawnMarkers.forEach(m => drawLayer.removeLayer(m));
        }
        drawnMarkers = [];
        if (livePolygon && drawLayer) {
            drawLayer.removeLayer(livePolygon);
            livePolygon = null;
        }
        if (liveLine && drawLayer) {
            drawLayer.removeLayer(liveLine);
            liveLine = null;
        }
        if (adminDrawVertexCount) adminDrawVertexCount.textContent = '0';
        if (adminBtnFinishArea) adminBtnFinishArea.disabled = true;
        if (adminBtnUndoDraw) adminBtnUndoDraw.disabled = true;
        if (adminSandLengthVal) adminSandLengthVal.textContent = '0m';
    }

    function updateDrawnVisuals() {
        if (adminDrawVertexCount) adminDrawVertexCount.textContent = drawnPoints.length;
        if (adminBtnUndoDraw) adminBtnUndoDraw.disabled = (drawnPoints.length === 0);

        if (!drawLayer) return;

        if (drawSubmode === 'sand-strip' || drawSubmode === 'freehand') {
            if (drawnPoints.length >= 2) {
                const ribbon = computeSandStripPolygon(drawnPoints, sandWidthMeters);
                const len = computePolylineLength(drawnPoints);
                if (adminSandLengthVal) adminSandLengthVal.textContent = `${len}m`;
                if (adminBtnFinishArea) adminBtnFinishArea.disabled = false;

                if (livePolygon) {
                    livePolygon.setLatLngs(ribbon);
                } else {
                    livePolygon = L.polygon(ribbon, {
                        color: '#d97706',
                        fillColor: '#f59e0b',
                        fillOpacity: 0.45,
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
                if (adminSandLengthVal) adminSandLengthVal.textContent = '0m';
                if (adminBtnFinishArea) adminBtnFinishArea.disabled = true;
            }
        } else if (drawSubmode === 'polygon') {
            if (drawnPoints.length >= 3) {
                if (adminBtnFinishArea) adminBtnFinishArea.disabled = false;
                const perimeter = computePolylineLength([...drawnPoints, drawnPoints[0]]);
                if (adminSandLengthVal) adminSandLengthVal.textContent = `${perimeter}m (perímetro)`;

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
                if (adminBtnFinishArea) adminBtnFinishArea.disabled = true;
                const len = computePolylineLength(drawnPoints);
                if (adminSandLengthVal) adminSandLengthVal.textContent = `${len}m`;
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
                if (adminBtnFinishArea) adminBtnFinishArea.disabled = true;
                if (adminSandLengthVal) adminSandLengthVal.textContent = '0m';
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
        if (m && drawLayer) drawLayer.removeLayer(m);
        reindexMarkers();
        updateDrawnVisuals();
    }

    function addVertex(lat, lng) {
        const idx = drawnPoints.length;
        drawnPoints.push([lat, lng]);

        const isSandMode = (drawSubmode === 'sand-strip' || drawSubmode === 'freehand');
        const iconClass = isSandMode ? 'sand-center-handle' : 'sand-vertex-handle';
        const tipText = isSandMode 
            ? 'Arraste para ajustar curvatura da areia • Clique para remover' 
            : 'Arraste para ajustar vértice • Clique para remover';

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

    function setDrawSubmode(mode) {
        drawSubmode = mode;
        [adminSubmodeSandStrip, adminSubmodePolygon, adminSubmodeFreehand].forEach(b => {
            if (b) b.classList.remove('active');
        });

        if (mode === 'sand-strip') {
            if (adminSubmodeSandStrip) adminSubmodeSandStrip.classList.add('active');
            if (adminDrawModeTitle) adminDrawModeTitle.textContent = 'Demarcação da Faixa de Areia';
            if (adminDrawInstructions) adminDrawInstructions.textContent = 'Clique ao longo da orla para traçar a faixa de areia da praia selecionada. Arraste qualquer ponto para ajustar a curvatura.';
            if (adminSandWidthToolbar) adminSandWidthToolbar.style.display = 'flex';
        } else if (mode === 'polygon') {
            if (adminSubmodePolygon) adminSubmodePolygon.classList.add('active');
            if (adminDrawModeTitle) adminDrawModeTitle.textContent = 'Polígono Detalhado da Praia';
            if (adminDrawInstructions) adminDrawInstructions.textContent = 'Clique nos limites da areia para criar o polígono de contorno. Arraste os pontos para refinar cada canto.';
            if (adminSandWidthToolbar) adminSandWidthToolbar.style.display = 'none';
        } else if (mode === 'freehand') {
            if (adminSubmodeFreehand) adminSubmodeFreehand.classList.add('active');
            if (adminDrawModeTitle) adminDrawModeTitle.textContent = 'Desenho Livre (Pincel de Areia)';
            if (adminDrawInstructions) adminDrawInstructions.textContent = 'Mantenha o botão do mouse pressionado e arraste livremente sobre a areia da praia.';
            if (adminSandWidthToolbar) adminSandWidthToolbar.style.display = 'flex';
        }
        updateDrawnVisuals();
    }

    function setDrawingMode(enable) {
        isDrawingMode = enable;

        if (enable) {
            if (btnAdminToggleDraw) {
                btnAdminToggleDraw.classList.add('active');
                btnAdminToggleDraw.style.background = '#10b981';
            }
            if (adminDrawBtnText) adminDrawBtnText.textContent = 'Cancelar Demarcação';
            if (adminDrawBanner) adminDrawBanner.style.display = 'block';

            if (adminAreaPolygon) {
                adminMap.removeLayer(adminAreaPolygon);
            }

            clearDrawnArea();
            setDrawSubmode(drawSubmode || 'sand-strip');

            if (adminMap) {
                adminMap.getContainer().style.cursor = 'crosshair';
            }
        } else {
            if (btnAdminToggleDraw) {
                btnAdminToggleDraw.classList.remove('active');
                btnAdminToggleDraw.style.background = '#d97706';
            }
            if (adminDrawBtnText) {
                const selectedId = selectElement.value;
                const praia = allPraias.find(p => p.id === selectedId);
                const hasArea = praia && praia.areaCoords && praia.areaCoords.length >= 3;
                adminDrawBtnText.textContent = hasArea ? 'Editar Área de Praia' : 'Demarcar Área de Praia';
            }
            if (adminDrawBanner) adminDrawBanner.style.display = 'none';
            clearDrawnArea();

            if (adminMap) {
                adminMap.getContainer().style.cursor = '';
            }

            // Restaura o polígono salvo da praia
            updatePraiaCoordsView();
        }
    }

    // Inicialização do Mapa do Admin
    function initAdminMap() {
        const mapContainer = document.getElementById('admin-leaflet-map');
        if (!mapContainer || adminMap) return;

        adminMap = L.map('admin-leaflet-map', {
            center: [-23.4450, -45.0750],
            zoom: 14,
            minZoom: 11,
            maxZoom: 19,
            maxBounds: UBATUBA_BOUNDS,
            maxBoundsViscosity: 1.0,
            zoomControl: true,
            attributionControl: false
        });

        drawLayer = L.layerGroup().addTo(adminMap);

        googleTerrainLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        });

        googleSatelliteLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        });

        googleTerrainLayer.addTo(adminMap);
        currentTile = googleTerrainLayer;

        if (btnAdminTerrain && btnAdminSatellite) {
            btnAdminTerrain.addEventListener('click', () => {
                if (currentTile !== googleTerrainLayer) {
                    adminMap.removeLayer(currentTile);
                    googleTerrainLayer.addTo(adminMap);
                    currentTile = googleTerrainLayer;
                    btnAdminTerrain.classList.add('active');
                    btnAdminSatellite.classList.remove('active');
                }
            });

            btnAdminSatellite.addEventListener('click', () => {
                if (currentTile !== googleSatelliteLayer) {
                    adminMap.removeLayer(currentTile);
                    googleSatelliteLayer.addTo(adminMap);
                    currentTile = googleSatelliteLayer;
                    btnAdminSatellite.classList.add('active');
                    btnAdminTerrain.classList.remove('active');
                }
            });
        }

        const pinIcon = L.divIcon({
            className: 'beach-custom-marker',
            html: `
                <div class="beach-marker-wrapper" style="transform: scale(1.15);">
                    <div class="beach-marker-pin" style="background-color: #ef4444;">
                        <span>📍</span>
                    </div>
                </div>
            `,
            iconSize: [40, 48],
            iconAnchor: [20, 48]
        });

        adminMarker = L.marker([-23.4450, -45.0750], {
            icon: pinIcon,
            draggable: true
        }).addTo(adminMap);

        adminMarker.on('drag', () => {
            if (isDrawingMode) return;
            const pos = adminMarker.getLatLng();
            syncCoordsInputs(pos.lat, pos.lng);
        });

        adminMarker.on('dragend', () => {
            if (isDrawingMode) return;
            const pos = adminMarker.getLatLng();
            syncCoordsInputs(pos.lat, pos.lng);
        });

        // Clique no mapa: se modo desenho ativo, adiciona ponto; senão, move marcador GPS
        adminMap.on('click', (e) => {
            const lat = Number(e.latlng.lat.toFixed(6));
            const lng = Number(e.latlng.lng.toFixed(6));

            if (isDrawingMode) {
                if (drawSubmode === 'freehand') return;
                addVertex(lat, lng);
            } else {
                adminMarker.setLatLng([lat, lng]);
                syncCoordsInputs(lat, lng);
            }
        });

        // Desenho Livre no Mapa
        adminMap.on('mousedown', (e) => {
            if (!isDrawingMode || drawSubmode !== 'freehand') return;
            isFreehandDrawing = true;
            clearDrawnArea();
            const lat = Number(e.latlng.lat.toFixed(6));
            const lng = Number(e.latlng.lng.toFixed(6));
            addVertex(lat, lng);
        });

        adminMap.on('mousemove', (e) => {
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

        adminMap.on('mouseup', () => {
            if (isFreehandDrawing) {
                isFreehandDrawing = false;
            }
        });

        // Duplo clique finaliza a área se tiver pontos suficientes
        adminMap.on('dblclick', (e) => {
            if (isDrawingMode && drawnPoints.length >= 2) {
                L.DomEvent.stopPropagation(e);
                saveDrawnAreaToBeach();
            }
        });

        function onManualCoordsChange() {
            const lat = parseFloat(latInput.value);
            const lng = parseFloat(lngInput.value);
            if (!isNaN(lat) && !isNaN(lng)) {
                adminMarker.setLatLng([lat, lng]);
                adminMap.panTo([lat, lng]);
                syncCoordsInputs(lat, lng, false);
            }
        }

        if (latInput) latInput.addEventListener('change', onManualCoordsChange);
        if (lngInput) lngInput.addEventListener('change', onManualCoordsChange);
    }

    // Configuração dos Botões de Demarcação
    if (btnAdminToggleDraw) {
        btnAdminToggleDraw.addEventListener('click', () => setDrawingMode(!isDrawingMode));
    }
    if (btnAdminTriggerDraw) {
        btnAdminTriggerDraw.addEventListener('click', () => setDrawingMode(true));
    }
    if (adminBtnCancelDraw) {
        adminBtnCancelDraw.addEventListener('click', () => setDrawingMode(false));
    }
    if (adminBtnClearDraw) {
        adminBtnClearDraw.addEventListener('click', clearDrawnArea);
    }
    if (adminBtnUndoDraw) {
        adminBtnUndoDraw.addEventListener('click', () => {
            if (drawnPoints.length > 0) {
                removeVertex(drawnPoints.length - 1);
            }
        });
    }

    if (adminSubmodeSandStrip) adminSubmodeSandStrip.addEventListener('click', () => setDrawSubmode('sand-strip'));
    if (adminSubmodePolygon) adminSubmodePolygon.addEventListener('click', () => setDrawSubmode('polygon'));
    if (adminSubmodeFreehand) adminSubmodeFreehand.addEventListener('click', () => setDrawSubmode('freehand'));

    if (adminSandWidthSlider) {
        adminSandWidthSlider.addEventListener('input', (e) => {
            sandWidthMeters = Number(e.target.value);
            if (adminSandWidthVal) adminSandWidthVal.textContent = `${sandWidthMeters}m`;
            adminSandQuickWidthBtns.forEach(btn => {
                btn.classList.toggle('active', Number(btn.getAttribute('data-width')) === sandWidthMeters);
            });
            updateDrawnVisuals();
        });
    }

    adminSandQuickWidthBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const w = Number(btn.getAttribute('data-width'));
            sandWidthMeters = w;
            if (adminSandWidthSlider) adminSandWidthSlider.value = w;
            if (adminSandWidthVal) adminSandWidthVal.textContent = `${w}m`;
            adminSandQuickWidthBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateDrawnVisuals();
        });
    });

    // Salvar Área Demarcada na Praia Selecionada
    async function saveDrawnAreaToBeach() {
        if (drawnPoints.length < 2) {
            alert('Trace pelo menos 2 pontos na orla para gerar a faixa de areia ou 3 pontos para polígono.');
            return;
        }

        const selectedId = selectElement.value;
        const praia = allPraias.find(p => p.id === selectedId);
        if (!praia) return;

        let finalAreaCoords = [];
        let centerCoords = [];

        if (drawSubmode === 'sand-strip' || drawSubmode === 'freehand') {
            finalAreaCoords = computeSandStripPolygon(drawnPoints, sandWidthMeters);
            centerCoords = computePolygonCentroid(finalAreaCoords);
        } else if (drawSubmode === 'polygon') {
            if (drawnPoints.length < 3) {
                alert('Polígono detalhado requer pelo menos 3 pontos.');
                return;
            }
            finalAreaCoords = [...drawnPoints];
            centerCoords = computePolygonCentroid(finalAreaCoords);
        }

        if (!finalAreaCoords || finalAreaCoords.length < 3) {
            alert('Não foi possível calcular o contorno da área.');
            return;
        }

        const originalBtnText = adminBtnFinishArea.textContent;
        adminBtnFinishArea.disabled = true;
        adminBtnFinishArea.textContent = 'Salvando Área no Servidor...';

        try {
            const res = await fetch(`${API_URL}/praias/${selectedId}/area`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token
                },
                body: JSON.stringify({
                    coords: centerCoords,
                    areaCoords: finalAreaCoords
                })
            });

            if (res.ok) {
                alert(`✅ Área da praia "${praia.name}" salva com sucesso!\n\nForam registrados ${finalAreaCoords.length} pontos de contorno costeiro.`);
                praia.areaCoords = finalAreaCoords;
                praia.coords = centerCoords;

                const idx = allPraias.findIndex(p => p.id === selectedId);
                if (idx !== -1) {
                    allPraias[idx].areaCoords = finalAreaCoords;
                    allPraias[idx].coords = centerCoords;
                }

                if (typeof PRAIAS_DATA !== 'undefined') {
                    const pIdx = PRAIAS_DATA.findIndex(p => p.id === selectedId);
                    if (pIdx !== -1) {
                        PRAIAS_DATA[pIdx].areaCoords = finalAreaCoords;
                        PRAIAS_DATA[pIdx].coords = centerCoords;
                    }
                }

                setDrawingMode(false);
                updatePraiaCoordsView();
            } else {
                const data = await res.json();
                alert(data.error || 'Erro ao salvar a área da praia.');
            }
        } catch (err) {
            console.error('Erro ao salvar área:', err);
            alert('Erro de conexão ao salvar a área costeira no servidor.');
        } finally {
            adminBtnFinishArea.disabled = false;
            adminBtnFinishArea.textContent = originalBtnText;
        }
    }

    if (adminBtnFinishArea) {
        adminBtnFinishArea.addEventListener('click', saveDrawnAreaToBeach);
    }

    // Excluir Área Demarcada da Praia
    if (btnAdminDeleteArea) {
        btnAdminDeleteArea.addEventListener('click', async () => {
            const selectedId = selectElement.value;
            const praia = allPraias.find(p => p.id === selectedId);
            if (!praia) return;

            if (!confirm(`Deseja realmente remover a área demarcada de "${praia.name}"?`)) return;

            try {
                const res = await fetch(`${API_URL}/praias/${selectedId}/area`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token
                    },
                    body: JSON.stringify({ areaCoords: null })
                });

                if (res.ok) {
                    alert(`Área demarcada da praia "${praia.name}" foi removida com sucesso.`);
                    praia.areaCoords = null;
                    const idx = allPraias.findIndex(p => p.id === selectedId);
                    if (idx !== -1) allPraias[idx].areaCoords = null;

                    if (typeof PRAIAS_DATA !== 'undefined') {
                        const pIdx = PRAIAS_DATA.findIndex(p => p.id === selectedId);
                        if (pIdx !== -1) PRAIAS_DATA[pIdx].areaCoords = null;
                    }

                    updatePraiaCoordsView();
                } else {
                    const data = await res.json();
                    alert(data.error || 'Erro ao remover a área da praia.');
                }
            } catch (e) {
                alert('Erro de conexão ao excluir área.');
            }
        });
    }

    function syncCoordsInputs(lat, lng, updateInputs = true) {
        const fixedLat = Number(lat).toFixed(6);
        const fixedLng = Number(lng).toFixed(6);

        if (updateInputs) {
            if (latInput) latInput.value = fixedLat;
            if (lngInput) lngInput.value = fixedLng;
        }
        if (coordsDisplay) {
            coordsDisplay.textContent = `${fixedLat}, ${fixedLng}`;
        }
        if (linkTestGoogle) {
            linkTestGoogle.href = `https://www.google.com/maps?q=${fixedLat},${fixedLng}`;
        }
        if (linkTestSite) {
            const selectedId = selectElement.value;
            linkTestSite.href = `praia.html?id=${selectedId}`;
        }
    }

    function updatePraiaCoordsView() {
        const selectedId = selectElement.value;
        const praia = allPraias.find(p => p.id === selectedId);
        if (!praia) return;

        const coords = (praia.coords && Array.isArray(praia.coords) && praia.coords.length === 2)
            ? praia.coords
            : [-23.4450, -45.0750];

        syncCoordsInputs(coords[0], coords[1]);

        // Atualiza status da área da praia
        const hasArea = (praia.areaCoords && Array.isArray(praia.areaCoords) && praia.areaCoords.length >= 3);
        if (adminAreaStatus) {
            if (hasArea) {
                adminAreaStatus.textContent = `🏖️ Área cadastrada (${praia.areaCoords.length} pontos)`;
                adminAreaStatus.style.background = 'rgba(16, 185, 129, 0.18)';
                adminAreaStatus.style.borderColor = 'rgba(16, 185, 129, 0.35)';
                adminAreaStatus.style.color = '#a7f3d0';
            } else {
                adminAreaStatus.textContent = '⚪ Nenhuma área demarcada';
                adminAreaStatus.style.background = 'rgba(255, 255, 255, 0.08)';
                adminAreaStatus.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                adminAreaStatus.style.color = 'var(--text-muted)';
            }
        }

        if (btnAdminDeleteArea) {
            btnAdminDeleteArea.style.display = hasArea ? 'inline-block' : 'none';
        }

        if (adminDrawBtnText && !isDrawingMode) {
            adminDrawBtnText.textContent = hasArea ? 'Editar Área de Praia' : 'Demarcar Área de Praia';
        }

        if (adminMap && adminMarker) {
            adminMarker.setLatLng(coords);
            adminMap.setView(coords, 14);
            setTimeout(() => adminMap.invalidateSize(), 150);

            if (adminAreaPolygon) {
                adminMap.removeLayer(adminAreaPolygon);
                adminAreaPolygon = null;
            }

            if (hasArea && !isDrawingMode) {
                adminAreaPolygon = L.polygon(praia.areaCoords, {
                    color: '#d97706',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.45,
                    weight: 2.5,
                    dashArray: '3, 4'
                }).addTo(adminMap).bindTooltip(`🏖️ Faixa de Areia de ${praia.name}`, { permanent: false, direction: 'center' });
            }
        }
    }

    initAdminMap();
    updatePraiaCoordsView();

    // Salvar Coordenadas
    if (coordsForm) {
        coordsForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const selectedId = selectElement.value;
            const praia = allPraias.find(p => p.id === selectedId);
            if (!praia) return;

            const lat = parseFloat(latInput.value);
            const lng = parseFloat(lngInput.value);

            if (isNaN(lat) || isNaN(lng)) {
                alert('Por favor, informe valores numéricos válidos para latitude e longitude.');
                return;
            }

            const originalBtnText = btnSaveCoords.textContent;
            btnSaveCoords.disabled = true;
            btnSaveCoords.textContent = 'Salvando Coordenadas...';

            try {
                const res = await fetch(`${API_URL}/praias/${selectedId}/coords`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token
                    },
                    body: JSON.stringify({
                        lat,
                        lng,
                        coords: [lat, lng]
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    alert(`✅ As coordenadas da praia "${praia.name}" foram atualizadas com sucesso!\n\nLatitude: ${lat.toFixed(6)}\nLongitude: ${lng.toFixed(6)}`);

                    praia.coords = [lat, lng];
                    const idx = allPraias.findIndex(p => p.id === selectedId);
                    if (idx !== -1) allPraias[idx].coords = [lat, lng];

                    updatePraiaCoordsView();
                } else {
                    const data = await res.json();
                    alert(data.error || 'Erro ao atualizar coordenadas da praia.');
                }
            } catch (err) {
                console.error('Erro ao salvar coordenadas:', err);
                alert('Erro de conexão ao salvar coordenadas no servidor.');
            } finally {
                btnSaveCoords.disabled = false;
                btnSaveCoords.textContent = originalBtnText;
            }
        });
    }

    selectElement.addEventListener('change', () => {
        if (isDrawingMode) {
            setDrawingMode(false);
        }
        resetForm();
        renderPraiaPhotos();
        updatePraiaCoordsView();
    });

    // Preview ao selecionar arquivo
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            urlInput.value = '';
            const reader = new FileReader();
            reader.onload = (event) => {
                previewImg.src = event.target.result;
                previewBox.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    // Preview ao digitar URL
    urlInput.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        if (url) {
            fileInput.value = '';
            previewImg.src = url;
            previewBox.style.display = 'block';
        } else {
            previewBox.style.display = 'none';
        }
    });

    // Função para preparar substituição de foto
    window.prepareReplace = (index) => {
        const selectedId = selectElement.value;
        const praia = allPraias.find(p => p.id === selectedId);
        if (!praia || !praia.images[index]) return;

        const currentImg = praia.images[index];
        targetIndexInput.value = index;
        formTitle.textContent = `Substituindo Foto #${index + 1} de ${praia.name}`;
        formDesc.textContent = 'Envie uma nova imagem ou cole um novo link para substituir a atual.';
        captionInput.value = currentImg.caption || '';
        cancelBtn.style.display = 'inline-block';

        form.scrollIntoView({ behavior: 'smooth' });
    };

    function resetForm() {
        targetIndexInput.value = '-1';
        formTitle.textContent = 'Adicionar Nova Foto para a Praia';
        formDesc.textContent = 'Envie um arquivo do seu dispositivo ou informe o link direto de uma foto da internet.';
        cancelBtn.style.display = 'none';
        form.reset();
        previewBox.style.display = 'none';
    }

    cancelBtn.addEventListener('click', resetForm);

    // Função para excluir foto
    window.deletePhoto = async (index) => {
        const selectedId = selectElement.value;
        if (!confirm(`Deseja realmente excluir a Foto #${index + 1} desta praia?`)) return;

        try {
            const formData = new FormData();
            formData.append('imageIndex', index);
            formData.append('action', 'delete');

            const res = await fetch(`${API_URL}/praias/${selectedId}/image`, {
                method: 'PUT',
                headers: {
                    'Authorization': token
                },
                body: formData
            });

            if (res.ok) {
                alert('Foto excluída com sucesso!');
                await fetchPraias();
                renderPraiaPhotos();
            } else {
                const data = await res.json();
                alert(data.error || 'Erro ao excluir foto.');
            }
        } catch (e) {
            alert('Erro de conexão com o servidor.');
        }
    };

    // Submissão do formulário (Adicionar ou Substituir)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedId = selectElement.value;
        const file = fileInput.files[0];
        const url = urlInput.value.trim();
        const caption = captionInput.value.trim();
        const index = parseInt(targetIndexInput.value);

        if (!file && !url) {
            alert('Por favor, selecione um arquivo de imagem ou digite uma URL válida.');
            return;
        }

        const formData = new FormData();
        if (file) {
            formData.append('image', file);
        } else if (url) {
            formData.append('imageUrl', url);
        }
        formData.append('caption', caption);
        formData.append('imageIndex', index);

        try {
            const res = await fetch(`${API_URL}/praias/${selectedId}/image`, {
                method: 'PUT',
                headers: {
                    'Authorization': token
                },
                body: formData
            });

            if (res.ok) {
                alert('Imagem atualizada com sucesso na praia!');
                resetForm();
                await fetchPraias();
                renderPraiaPhotos();
            } else {
                const data = await res.json();
                alert(data.error || 'Erro ao salvar imagem.');
            }
        } catch (err) {
            alert('Erro de conexão ao salvar a imagem.');
        }
    });
});
