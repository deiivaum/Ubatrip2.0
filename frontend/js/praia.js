window.API_URL = window.API_URL || '/api';
var API_URL = window.API_URL;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const praiaId = urlParams.get('id');

    if (!praiaId) {
        renderNotFound();
        return;
    }

    let praia = null;

    // Tenta buscar da API para pegar imagens atualizadas pelo Admin
    try {
        const res = await fetch(`${API_URL}/praias/${praiaId}`);
        if (res.ok) {
            praia = await res.json();
        }
    } catch (e) {
        console.warn('Usando dados locais de fallback para a praia:', e);
    }

    // Fallback para PRAIAS_DATA se a API não retornou
    if (!praia && typeof PRAIAS_DATA !== 'undefined') {
        praia = PRAIAS_DATA.find(p => p.id === praiaId);
    }

    if (!praia) {
        renderNotFound();
        return;
    }

    // Se o usuário logado for Admin, exibe botão para editar as imagens
    const userJson = localStorage.getItem('user');
    if (userJson) {
        const user = JSON.parse(userJson);
        if (user.role === 'admin') {
            const adminBox = document.getElementById('admin-beach-action');
            const adminLink = document.getElementById('admin-edit-link');
            if (adminBox && adminLink) {
                adminBox.style.display = 'block';
                adminLink.href = `admin.html?praia=${praia.id}`;
            }
        }
    }

    // Atualiza o título da página
    document.title = `${praia.name} - UbaTrip`;

    // Cabeçalho
    document.getElementById('praia-name').textContent = praia.name;
    document.getElementById('praia-subtitle').textContent = praia.subtitle;

    // Tags
    const tagsContainer = document.getElementById('praia-tags');
    if (tagsContainer && praia.tags) {
        tagsContainer.innerHTML = praia.tags.map(tag => 
            `<span class="tag-pill">${tag}</span>`
        ).join('');
    }

    // Modal de Imagem Limpo
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');

    function resizeModalImage() {
        if (!modalImg || !modal || !modal.classList.contains('active')) return;
        const natW = modalImg.naturalWidth || 1000;
        const natH = modalImg.naturalHeight || 700;
        const aspect = natW / natH;

        const maxW = Math.min(window.innerWidth * 0.90, 1200);
        const maxH = Math.min(window.innerHeight * 0.86, 850);

        let targetW = maxW;
        let targetH = targetW / aspect;

        if (targetH > maxH) {
            targetH = maxH;
            targetW = targetH * aspect;
        }

        modalImg.style.width = Math.round(targetW) + 'px';
        modalImg.style.height = Math.round(targetH) + 'px';
    }

    if (modalImg) {
        modalImg.addEventListener('load', resizeModalImage);
        window.addEventListener('resize', resizeModalImage);
    }

    window.openImageModal = function(src) {
        if (!modal || !modalImg) return;
        modalImg.src = src;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (modalImg.complete) {
            resizeModalImage();
        }
    };

    window.closeImageModal = function() {
        if (!modal) return;
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        if (modalImg) {
            modalImg.src = '';
            modalImg.style.width = '';
            modalImg.style.height = '';
        }
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
            window.closeImageModal();
        }
    });

    // Atualiza link de CTA para enviar foto desta praia
    const ctaGalleryLink = document.getElementById('cta-gallery-link');
    if (ctaGalleryLink) {
        ctaGalleryLink.href = `gallery.html?praia=${encodeURIComponent(praia.id)}`;
    }

    // Galeria de Fotos da Praia (Combina fotos oficiais e fotos da comunidade da Galeria)
    const photosContainer = document.getElementById('praia-photos');
    let allPhotos = praia.images ? [...praia.images] : [];

    try {
        const galRes = await fetch(`${API_URL}/gallery/praia/${praia.id}`);
        if (galRes.ok) {
            const communityImages = await galRes.json();
            if (Array.isArray(communityImages)) {
                communityImages.forEach(cImg => {
                    const imgUrl = `http://localhost:3000/uploads/${cImg.filename}`;
                    const exists = allPhotos.some(p => p.url === imgUrl || (p.filename && p.filename === cImg.filename));
                    if (!exists) {
                        allPhotos.push({
                            url: imgUrl,
                            caption: cImg.description || `Foto de ${cImg.author} na ${praia.name}`,
                            author: cImg.author,
                            community: true
                        });
                    }
                });
            }
        }
    } catch (e) {
        console.warn('Aviso: Não foi possível carregar fotos adicionais da galeria:', e);
    }

    if (photosContainer) {
        if (allPhotos.length === 0) {
            photosContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1rem; background: var(--bg-secondary); border-radius: 12px; border: 1px dashed var(--border-color);">
                    <p style="color: var(--text-muted); margin-bottom: 1.2rem; font-size: 0.95rem;">Nenhuma foto cadastrada para esta praia ainda.</p>
                    <a href="gallery.html?praia=${encodeURIComponent(praia.id)}" class="btn-pill" style="font-size: 0.85rem; padding: 0.55rem 1.4rem;">
                        📸 Seja o primeiro a compartilhar uma foto na Galeria &rarr;
                    </a>
                </div>
            `;
        } else {
            photosContainer.innerHTML = allPhotos.map(img => {
                const isCommunity = img.community || (img.author && img.author !== 'UbaTrip');
                const badge = isCommunity ? `<span class="photo-community-badge">👥 ${img.author ? 'Foto de ' + img.author : 'Comunidade'}</span>` : '';
                return `
                    <div class="praia-photo-card" style="cursor: pointer; position: relative;" onclick="openImageModal('${img.url}')" title="Clique para expandir a foto">
                        <img src="${img.url}" alt="${img.caption || praia.name}" loading="lazy">
                        ${badge}
                        <div class="photo-caption">${img.caption || praia.name}</div>
                    </div>
                `;
            }).join('');
        }
    }

    // Descrição completa
    document.getElementById('praia-full-desc').textContent = praia.fullDesc;

    // Acesso
    document.getElementById('praia-access-type').textContent = praia.access.tipo;
    document.getElementById('praia-access-desc').textContent = praia.access.descricao;

    // Estacionamento
    document.getElementById('praia-parking-status').textContent = praia.parking.status;
    document.getElementById('praia-parking-desc').textContent = praia.parking.descricao;

    // Infraestrutura
    const infraList = document.getElementById('praia-infrastructure-list');
    if (infraList && praia.infrastructure) {
        infraList.innerHTML = praia.infrastructure.map(item => `
            <li><span class="bullet-check">✔</span> ${item}</li>
        `).join('');
    }

    // Mini Mapa ou link de GPS
    const miniMapElement = document.getElementById('mini-map');
    if (miniMapElement && praia.coords && Array.isArray(praia.coords)) {
        try {
            if (typeof L !== 'undefined') {
                const southWest = L.latLng(-23.6300, -45.3800);
                const northEast = L.latLng(-23.2300, -44.7000);
                const ubatubaBounds = L.latLngBounds(southWest, northEast);

                const miniMap = L.map('mini-map', {
                    maxBounds: ubatubaBounds,
                    maxBoundsViscosity: 1.0,
                    minZoom: 11,
                    maxZoom: 18
                }).setView(praia.coords, 14);

                if (L.Icon && L.Icon.Default) {
                    delete L.Icon.Default.prototype._getIconUrl;
                    L.Icon.Default.mergeOptions({
                        iconRetinaUrl: 'vendor/leaflet/images/marker-icon-2x.png',
                        iconUrl: 'vendor/leaflet/images/marker-icon.png',
                        shadowUrl: 'vendor/leaflet/images/marker-shadow.png',
                    });
                }

                L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                    maxZoom: 20
                }).addTo(miniMap);

                setTimeout(() => miniMap.invalidateSize(), 150);

                // Desenha polígono da área da praia se disponível
                if (praia.areaCoords && Array.isArray(praia.areaCoords) && praia.areaCoords.length >= 3) {
                    const regionColors = {
                        norte: { color: '#059669', fill: '#10b981' },
                        centro: { color: '#d97706', fill: '#f59e0b' },
                        sul: { color: '#0284c7', fill: '#38bdf8' },
                        ilhas: { color: '#7c3aed', fill: '#a855f7' }
                    };
                    const col = regionColors[praia.region] || regionColors.centro;
                    L.polygon(praia.areaCoords, {
                        color: col.color,
                        fillColor: col.fill,
                        fillOpacity: 0.45,
                        weight: 2.5
                    }).addTo(miniMap).bindTooltip(`<b>Área de ${praia.name}</b>`, { sticky: true });
                }

                const marker = L.marker(praia.coords).addTo(miniMap);
                marker.bindPopup(`<b>${praia.name}</b><br>${praia.shortDesc}`).openPopup();
            } else {
                miniMapElement.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background: var(--bg-secondary); border-radius: 12px; padding: 2rem; text-align: center;">
                        <span style="font-size: 2.5rem; margin-bottom: 0.8rem;">📍</span>
                        <h4 style="font-family: var(--font-serif); font-size: 1.3rem; margin-bottom: 0.5rem;">Coordenadas de ${praia.name}</h4>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.2rem;">Lat: ${praia.coords[0]}, Lng: ${praia.coords[1]}</p>
                        <a href="https://www.google.com/maps/dir/?api=1&destination=${praia.coords[0]},${praia.coords[1]}" target="_blank" rel="noopener noreferrer" class="btn-pill" style="padding: 0.6rem 1.6rem; font-size: 0.85rem;">
                            Abrir Rota no Google Maps / GPS &rarr;
                        </a>
                    </div>
                `;
            }
        } catch (err) {
            console.warn('Erro ao carregar mini-mapa:', err);
            miniMapElement.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background: var(--bg-secondary); border-radius: 12px; padding: 2rem; text-align: center;">
                    <span style="font-size: 2.5rem; margin-bottom: 0.8rem;">📍</span>
                    <h4 style="font-family: var(--font-serif); font-size: 1.3rem; margin-bottom: 0.5rem;">Localização de ${praia.name}</h4>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.2rem;">Próximo à costa de Ubatuba, SP</p>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${praia.coords[0]},${praia.coords[1]}" target="_blank" rel="noopener noreferrer" class="btn-pill" style="padding: 0.6rem 1.6rem; font-size: 0.85rem;">
                        Abrir Rota no Google Maps &rarr;
                    </a>
                </div>
            `;
        }
    }
});

function renderNotFound() {
    const mainContent = document.getElementById('praia-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div style="text-align: center; padding: 5rem 1rem;">
                <h1 style="font-family: var(--font-serif); font-size: 2.5rem; margin-bottom: 1rem;">Praia não encontrada</h1>
                <p style="color: var(--text-muted); margin-bottom: 2rem;">Não foi possível carregar os detalhes do local selecionado.</p>
                <a href="index.html#mapa" class="btn-pill">&larr; Voltar para o Mapa</a>
            </div>
        `;
    }
}
