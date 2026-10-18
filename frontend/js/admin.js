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

    // ==================== MAPA DE COORDENADAS DO ADMIN ====================
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

    let adminMap = null;
    let adminMarker = null;
    let adminAreaPolygon = null;
    let googleTerrainLayer = null;
    let googleSatelliteLayer = null;
    let currentTile = null;

    function initAdminMap() {
        const mapContainer = document.getElementById('admin-leaflet-map');
        if (!mapContainer || adminMap) return;

        adminMap = L.map('admin-leaflet-map', {
            center: [-23.4450, -45.0750],
            zoom: 13,
            minZoom: 11,
            maxZoom: 18,
            maxBounds: UBATUBA_BOUNDS,
            maxBoundsViscosity: 1.0,
            zoomControl: true,
            attributionControl: false
        });

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
            const pos = adminMarker.getLatLng();
            syncCoordsInputs(pos.lat, pos.lng);
        });

        adminMarker.on('dragend', () => {
            const pos = adminMarker.getLatLng();
            syncCoordsInputs(pos.lat, pos.lng);
        });

        adminMap.on('click', (e) => {
            const lat = Number(e.latlng.lat.toFixed(6));
            const lng = Number(e.latlng.lng.toFixed(6));
            adminMarker.setLatLng([lat, lng]);
            syncCoordsInputs(lat, lng);
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

        if (adminMap && adminMarker) {
            adminMarker.setLatLng(coords);
            adminMap.setView(coords, 14);
            setTimeout(() => adminMap.invalidateSize(), 150);

            if (adminAreaPolygon) {
                adminMap.removeLayer(adminAreaPolygon);
                adminAreaPolygon = null;
            }

            if (praia.areaCoords && Array.isArray(praia.areaCoords) && praia.areaCoords.length >= 3) {
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
