window.API_URL = window.API_URL || '/api';
var API_URL = window.API_URL;

document.addEventListener('DOMContentLoaded', () => {
    // Referências do DOM
    const form = document.getElementById('cadastro-praia-form');
    const nameInput = document.getElementById('beach-name');
    const regionSelect = document.getElementById('beach-region');
    const subtitleInput = document.getElementById('beach-subtitle');
    const fileInput = document.getElementById('beach-file');
    const urlInput = document.getElementById('beach-url');
    const shortDescInput = document.getElementById('beach-shortdesc');
    const fullDescInput = document.getElementById('beach-fulldesc');
    const accessInput = document.getElementById('beach-access');
    const parkingInput = document.getElementById('beach-parking');
    const tagsInput = document.getElementById('beach-tags');
    const latInput = document.getElementById('new-beach-lat');
    const lngInput = document.getElementById('new-beach-lng');
    const areaCoordsInput = document.getElementById('new-beach-area-coords');
    const geoDisplay = document.getElementById('geo-coords-display');
    const imagePreviewWrapper = document.getElementById('image-preview-wrapper');
    const imagePreviewEl = document.getElementById('image-preview-el');
    const submitBtn = document.getElementById('btn-submit-praia');
    const drawBadge = document.getElementById('cadastro-draw-badge');

    // Botões de alternância de camada
    const btnTerrain = document.getElementById('btn-cadastro-terrain');
    const btnSatellite = document.getElementById('btn-cadastro-satellite');

    // ==================== LER PARÂMETROS DA URL ====================
    const urlParams = new URLSearchParams(window.location.search);
    const paramLat = parseFloat(urlParams.get('lat'));
    const paramLng = parseFloat(urlParams.get('lng'));
    const paramArea = urlParams.get('area');
    const paramRegion = urlParams.get('region');
    const paramName = urlParams.get('name');

    // Ponto inicial padrão (Ubatuba)
    let initialLat = !isNaN(paramLat) ? paramLat : -23.4450;
    let initialLng = !isNaN(paramLng) ? paramLng : -45.0750;

    if (paramName && nameInput) nameInput.value = paramName;
    if (paramRegion && regionSelect) regionSelect.value = paramRegion;

    latInput.value = initialLat.toFixed(6);
    lngInput.value = initialLng.toFixed(6);
    if (geoDisplay) geoDisplay.textContent = `${initialLat.toFixed(6)}, ${initialLng.toFixed(6)}`;

    let parsedAreaCoords = null;
    if (paramArea) {
        try {
            parsedAreaCoords = JSON.parse(decodeURIComponent(paramArea));
            if (Array.isArray(parsedAreaCoords) && parsedAreaCoords.length >= 3) {
                areaCoordsInput.value = JSON.stringify(parsedAreaCoords);
                if (drawBadge) drawBadge.style.display = 'block';
            }
        } catch (e) {
            console.warn('Erro ao decodificar área da URL:', e);
        }
    }

    // ==================== MAPA LEAFLET GOOGLE RESTPOSTO A UBATUBA ====================
    const UBATUBA_BOUNDS = L.latLngBounds(
        [-23.6300, -45.3800], // Sudoeste
        [-23.2300, -44.7000]  // Nordeste
    );

    const map = L.map('cadastro-leaflet-map', {
        center: [initialLat, initialLng],
        zoom: !isNaN(paramLat) ? 14 : 12,
        minZoom: 11,
        maxZoom: 18,
        maxBounds: UBATUBA_BOUNDS,
        maxBoundsViscosity: 1.0,
        zoomControl: true,
        attributionControl: false
    });

    // Camadas do Google Maps
    const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    const googleSatellite = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    googleTerrain.addTo(map);
    let currentTileLayer = googleTerrain;

    // ==================== CÁLCULO GEOMÉTRICO DA FAIXA DE AREIA ====================
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

    function computeCentroid(pts) {
        if (!pts || pts.length === 0) return [initialLat, initialLng];
        const avgLat = pts.reduce((acc, p) => acc + p[0], 0) / pts.length;
        const avgLng = pts.reduce((acc, p) => acc + p[1], 0) / pts.length;
        return [Number(avgLat.toFixed(6)), Number(avgLng.toFixed(6))];
    }

    // Marcador arrastável principal
    const pinIcon = L.divIcon({
        className: 'beach-custom-marker',
        html: `
            <div class="beach-marker-wrapper" style="transform: scale(1.1);">
                <div class="beach-marker-pin" style="background-color: #ef4444;">
                    <span>📍</span>
                </div>
            </div>
        `,
        iconSize: [40, 48],
        iconAnchor: [20, 48]
    });

    const marker = L.marker([initialLat, initialLng], {
        icon: pinIcon,
        draggable: true
    }).addTo(map);

    function updateCoords(lat, lng) {
        latInput.value = Number(lat).toFixed(6);
        lngInput.value = Number(lng).toFixed(6);
        if (geoDisplay) geoDisplay.textContent = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    }

    marker.on('dragend', () => {
        const pos = marker.getLatLng();
        updateCoords(pos.lat, pos.lng);
    });

    // Elementos de Modo de Marcação do Cadastro
    const btnCadModePin = document.getElementById('btn-cad-mode-pin');
    const btnCadModeSand = document.getElementById('btn-cad-mode-sand');
    const cadSandControls = document.getElementById('cad-sand-controls');
    const cadSandSlider = document.getElementById('cad-sand-slider');
    const cadSandWidthVal = document.getElementById('cad-sand-width-val');
    const cadSandExtVal = document.getElementById('cad-sand-ext-val');
    const btnCadUndoSand = document.getElementById('btn-cad-undo-sand');
    const btnCadClearSand = document.getElementById('btn-cad-clear-sand');
    const cadMapHelper = document.getElementById('cad-map-helper');

    let cadMode = 'pin'; // 'pin' | 'sand'
    let cadSandWidth = 35;
    let cadPoints = [];
    let cadMarkers = [];
    let cadLivePolygon = null;
    let cadLiveLine = null;
    const cadDrawLayer = L.layerGroup().addTo(map);

    function updateCadSandVisuals() {
        if (btnCadUndoSand) btnCadUndoSand.disabled = (cadPoints.length === 0);

        if (cadPoints.length >= 2) {
            const ribbon = computeSandStripPolygon(cadPoints, cadSandWidth);
            const len = computePolylineLength(cadPoints);
            if (cadSandExtVal) cadSandExtVal.textContent = `${len}m`;

            if (cadLivePolygon) {
                cadLivePolygon.setLatLngs(ribbon);
            } else {
                cadLivePolygon = L.polygon(ribbon, {
                    color: '#d97706',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.42,
                    weight: 2.5,
                    dashArray: '3, 4'
                }).addTo(cadDrawLayer);
            }

            if (cadLiveLine) {
                cadLiveLine.setLatLngs(cadPoints);
            } else {
                cadLiveLine = L.polyline(cadPoints, {
                    color: '#fef08a',
                    weight: 2,
                    dashArray: '4, 4'
                }).addTo(cadDrawLayer);
            }

            // Atualiza o input de área e sincroniza o ponto central
            areaCoordsInput.value = JSON.stringify(ribbon);
            if (drawBadge) {
                drawBadge.style.display = 'block';
                drawBadge.textContent = `Faixa de Areia: ~${len}m de extensão (${cadSandWidth}m de largura)`;
            }

            const center = computeCentroid(ribbon);
            marker.setLatLng(center);
            updateCoords(center[0], center[1]);
        } else {
            if (cadLivePolygon) { cadDrawLayer.removeLayer(cadLivePolygon); cadLivePolygon = null; }
            if (cadLiveLine) { cadDrawLayer.removeLayer(cadLiveLine); cadLiveLine = null; }
            if (cadSandExtVal) cadSandExtVal.textContent = '0m';
        }
    }

    function reindexCadMarkers() {
        cadMarkers.forEach((m, idx) => {
            m.off('drag');
            m.off('click');
            m.on('drag', (e) => {
                const pos = e.target.getLatLng();
                cadPoints[idx] = [Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6))];
                updateCadSandVisuals();
            });
            m.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                cadPoints.splice(idx, 1);
                cadDrawLayer.removeLayer(m);
                cadMarkers.splice(idx, 1);
                reindexCadMarkers();
                updateCadSandVisuals();
            });
        });
    }

    function addCadSandPoint(lat, lng) {
        const idx = cadPoints.length;
        cadPoints.push([lat, lng]);

        const handle = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'draw-vertex-marker-wrap',
                html: '<div class="sand-center-handle" title="Arraste para ajustar à curvatura da areia"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            }),
            draggable: true
        }).addTo(cadDrawLayer);

        handle.on('drag', (e) => {
            const pos = e.target.getLatLng();
            cadPoints[idx] = [Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6))];
            updateCadSandVisuals();
        });

        handle.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            cadPoints.splice(idx, 1);
            cadDrawLayer.removeLayer(handle);
            cadMarkers.splice(idx, 1);
            reindexCadMarkers();
            updateCadSandVisuals();
        });

        cadMarkers.push(handle);
        reindexCadMarkers();
        updateCadSandVisuals();
    }

    // Alternador de Modos do Mapa do Cadastro
    if (btnCadModePin && btnCadModeSand) {
        btnCadModePin.addEventListener('click', () => {
            cadMode = 'pin';
            btnCadModePin.style.background = 'var(--olive-btn)';
            btnCadModePin.style.color = '#fff';
            btnCadModeSand.style.background = 'transparent';
            btnCadModeSand.style.color = 'var(--text-primary)';
            if (cadSandControls) cadSandControls.style.display = 'none';
            if (cadMapHelper) cadMapHelper.textContent = 'Clique em qualquer ponto do litoral de Ubatuba para fixar o ponto exato da praia.';
        });

        btnCadModeSand.addEventListener('click', () => {
            cadMode = 'sand';
            btnCadModeSand.style.background = '#f59e0b';
            btnCadModeSand.style.color = '#1c1917';
            btnCadModePin.style.background = 'transparent';
            btnCadModePin.style.color = 'var(--text-primary)';
            if (cadSandControls) cadSandControls.style.display = 'block';
            if (cadMapHelper) cadMapHelper.textContent = 'Clique ao longo da orla de Ubatuba para traçar a faixa de areia. Arraste qualquer ponto para curvar e use o slider para regular a largura.';
        });
    }

    if (cadSandSlider) {
        cadSandSlider.addEventListener('input', (e) => {
            cadSandWidth = Number(e.target.value);
            if (cadSandWidthVal) cadSandWidthVal.textContent = `${cadSandWidth}m`;
            updateCadSandVisuals();
        });
    }

    if (btnCadUndoSand) {
        btnCadUndoSand.addEventListener('click', () => {
            if (cadPoints.length > 0) {
                cadPoints.pop();
                const m = cadMarkers.pop();
                if (m) cadDrawLayer.removeLayer(m);
                reindexCadMarkers();
                updateCadSandVisuals();
            }
        });
    }

    if (btnCadClearSand) {
        btnCadClearSand.addEventListener('click', () => {
            cadPoints = [];
            cadMarkers.forEach(m => cadDrawLayer.removeLayer(m));
            cadMarkers = [];
            if (cadLivePolygon) { cadDrawLayer.removeLayer(cadLivePolygon); cadLivePolygon = null; }
            if (cadLiveLine) { cadDrawLayer.removeLayer(cadLiveLine); cadLiveLine = null; }
            if (cadSandExtVal) cadSandExtVal.textContent = '0m';
            if (btnCadUndoSand) btnCadUndoSand.disabled = true;
            areaCoordsInput.value = '';
            if (drawBadge) drawBadge.style.display = 'none';
        });
    }

    // Clique no mapa da página de cadastro
    map.on('click', (e) => {
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));

        if (cadMode === 'sand') {
            addCadSandPoint(lat, lng);
        } else {
            marker.setLatLng([lat, lng]);
            updateCoords(lat, lng);
        }
    });

    // Se tiver área demarcada carregada via URL
    if (parsedAreaCoords && Array.isArray(parsedAreaCoords)) {
        L.polygon(parsedAreaCoords, {
            color: '#d97706',
            fillColor: '#f59e0b',
            fillOpacity: 0.45,
            weight: 2.5,
            dashArray: '3, 4'
        }).addTo(map).bindTooltip('🏖️ Faixa de Areia Costeira', { permanent: true, direction: 'center' });

        map.fitBounds(L.polygon(parsedAreaCoords).getBounds(), { padding: [30, 30] });
    }

    setTimeout(() => map.invalidateSize(), 200);

    // ==================== ALTERNADOR DE CAMADA NO MAPA ====================
    if (btnTerrain && btnSatellite) {
        btnTerrain.addEventListener('click', () => {
            if (currentTileLayer !== googleTerrain) {
                map.removeLayer(currentTileLayer);
                googleTerrain.addTo(map);
                currentTileLayer = googleTerrain;
                btnTerrain.classList.add('active');
                btnSatellite.classList.remove('active');
            }
        });

        btnSatellite.addEventListener('click', () => {
            if (currentTileLayer !== googleSatellite) {
                map.removeLayer(currentTileLayer);
                googleSatellite.addTo(map);
                currentTileLayer = googleSatellite;
                btnSatellite.classList.add('active');
                btnTerrain.classList.remove('active');
            }
        });
    }

    // ==================== ATUALIZAÇÃO MANUAL DOS INPUTS ====================
    function onManualCoordsChange() {
        const lat = parseFloat(latInput.value);
        const lng = parseFloat(lngInput.value);
        if (!isNaN(lat) && !isNaN(lng)) {
            marker.setLatLng([lat, lng]);
            map.panTo([lat, lng]);
            if (geoDisplay) geoDisplay.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
    }
    latInput.addEventListener('change', onManualCoordsChange);
    lngInput.addEventListener('change', onManualCoordsChange);

    // ==================== PREVIEW DA IMAGEM ====================
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    imagePreviewEl.src = evt.target.result;
                    imagePreviewWrapper.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (urlInput) {
        urlInput.addEventListener('input', () => {
            const val = urlInput.value.trim();
            if (val && val.startsWith('http')) {
                imagePreviewEl.src = val;
                imagePreviewWrapper.style.display = 'block';
            } else if (!fileInput.files[0]) {
                imagePreviewWrapper.style.display = 'none';
            }
        });
    }

    // ==================== SUBMISSÃO DO FORMULÁRIO ====================
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const origText = submitBtn ? submitBtn.textContent : 'Salvar';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Salvando e Publicando Praia...';
            }

            const name = nameInput.value.trim();
            const region = regionSelect.value;
            const subtitle = subtitleInput.value.trim();
            const file = fileInput ? fileInput.files[0] : null;
            const url = urlInput ? urlInput.value.trim() : '';
            const shortDesc = shortDescInput.value.trim();
            const fullDesc = fullDescInput.value.trim();
            const accessTipo = accessInput.value.trim();
            const parkingStatus = parkingInput.value.trim();
            const tags = tagsInput.value.trim();

            const lat = parseFloat(latInput.value) || initialLat;
            const lng = parseFloat(lngInput.value) || initialLng;
            const area = areaCoordsInput.value;

            // Coleta checkboxes de infraestrutura selecionadas
            const infraChecked = Array.from(document.querySelectorAll('input[name="infra"]:checked'))
                .map(cb => cb.value);

            const formData = new FormData();
            formData.append('name', name);
            formData.append('region', region);
            formData.append('subtitle', subtitle);
            formData.append('shortDesc', shortDesc);
            formData.append('fullDesc', fullDesc);
            formData.append('accessTipo', accessTipo);
            formData.append('parkingStatus', parkingStatus);
            formData.append('coords', JSON.stringify([lat, lng]));
            formData.append('infrastructure', JSON.stringify(infraChecked));
            formData.append('tags', tags);

            if (area) {
                formData.append('areaCoords', area);
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
                    alert(`✅ A praia "${data.praia.name}" foi cadastrada com sucesso! Redirecionando para a página da praia...`);
                    // REDIRECIONA IMEDIATAMENTE PARA A PÁGINA DA PRAIA RECÉM-CADASTRADA
                    window.location.href = `praia.html?id=${data.praia.id}`;
                } else {
                    const err = await res.json();
                    alert(err.error || 'Erro ao cadastrar praia.');
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = origText;
                    }
                }
            } catch (err) {
                console.error('Erro na requisição:', err);
                alert('Erro de comunicação com o servidor ao cadastrar nova praia.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = origText;
                }
            }
        });
    }
});
