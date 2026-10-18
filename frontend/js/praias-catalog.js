window.API_URL = window.API_URL || '/api';
var API_URL = window.API_URL;

// Redirecionamento para página dedicada de cadastro
window.openAddBeachModal = function() {
    window.location.href = 'cadastrar-praia.html';
};

window.closeAddBeachModal = function() {
    // No-op
};

// Tecla ESC fecha modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeAddBeachModal();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const catalogGrid = document.getElementById('praias-catalog-grid');
    const searchInput = document.getElementById('beach-search-input');
    const filterPills = document.querySelectorAll('.filter-pill');
    const countElement = document.getElementById('beaches-count');
    const addBeachForm = document.getElementById('add-beach-form');

    let allPraias = typeof PRAIAS_DATA !== 'undefined' ? [...PRAIAS_DATA] : [];
    let currentRegion = 'todas';
    let searchQuery = '';

    // Renderiza os cards filtrados
    function renderCatalog() {
        if (!catalogGrid) return;

        const filtered = allPraias.filter(p => {
            const matchRegion = currentRegion === 'todas' || p.region === currentRegion;
            const q = searchQuery.toLowerCase();
            const matchSearch = !q || 
                p.name.toLowerCase().includes(q) || 
                (p.shortDesc && p.shortDesc.toLowerCase().includes(q)) ||
                (p.tags && p.tags.some(t => t.toLowerCase().includes(q)));
            return matchRegion && matchSearch;
        });

        if (countElement) {
            countElement.textContent = filtered.length;
        }

        if (filtered.length === 0) {
            catalogGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                    <p style="font-size: 1.1rem; margin-bottom: 1rem;">Nenhuma praia encontrada com os filtros selecionados.</p>
                    <button class="btn-pill" onclick="resetFilters()">Limpar Filtros</button>
                </div>
            `;
            return;
        }

        catalogGrid.innerHTML = filtered.map(praia => {
            const coverImage = (praia.images && praia.images[0]) 
                ? praia.images[0].url 
                : 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80';
            
            const regionLabels = {
                norte: 'Norte',
                centro: 'Centro',
                sul: 'Sul',
                ilhas: 'Ilha'
            };
            const regionText = regionLabels[praia.region] || 'Ubatuba';

            return `
                <a href="praia.html?id=${praia.id}" class="praia-preview-card" title="Ver detalhes de ${praia.name}">
                    <div style="position: relative; overflow: hidden;">
                        <img src="${coverImage}" alt="${praia.name}" loading="lazy">
                        <span class="region-badge-overlay">${regionText}</span>
                    </div>
                    <div class="preview-content">
                        <h4>${praia.name}</h4>
                        <p>${praia.shortDesc || praia.subtitle || 'Bela praia em Ubatuba'}</p>
                        <div class="preview-footer">
                            <span class="preview-badge">🚗 ${(praia.access && praia.access.tipo) ? praia.access.tipo.split('e')[0] : 'Fácil Acesso'}</span>
                            <span class="preview-link">Ver praia &rarr;</span>
                        </div>
                    </div>
                </a>
            `;
        }).join('');
    }

    // Carrega praias da API
    async function fetchPraias() {
        try {
            const res = await fetch(`${API_URL}/praias`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    allPraias = data;
                    renderCatalog();
                }
            }
        } catch (e) {
            console.warn('API indisponível, usando catálogo inicial.');
        }
    }

    // Busca em tempo real
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderCatalog();
        });
    }

    // Filtros de Região
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentRegion = pill.getAttribute('data-region');
            renderCatalog();
        });
    });

    window.resetFilters = () => {
        currentRegion = 'todas';
        searchQuery = '';
        if (searchInput) searchInput.value = '';
        filterPills.forEach(p => p.classList.toggle('active', p.getAttribute('data-region') === 'todas'));
        renderCatalog();
    };

    // Submissão do formulário de cadastro de praia
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
            const mapXInput = document.getElementById('new-beach-mapx');
            const mapYInput = document.getElementById('new-beach-mapy');

            const defaultCoordsByRegion = {
                norte: { x: 72, y: 35 },
                centro: { x: 50, y: 55 },
                sul: { x: 30, y: 72 },
                ilhas: { x: 45, y: 80 }
            };
            const defaultRegionCoord = defaultCoordsByRegion[region] || { x: 50, y: 50 };
            const mapX = (mapXInput && mapXInput.value) ? mapXInput.value : defaultRegionCoord.x;
            const mapY = (mapYInput && mapYInput.value) ? mapYInput.value : defaultRegionCoord.y;

            const formData = new FormData();
            formData.append('name', name);
            formData.append('region', region);
            formData.append('subtitle', subtitle);
            formData.append('shortDesc', shortDesc);
            formData.append('fullDesc', fullDesc);
            formData.append('accessTipo', accessTipo);
            formData.append('parkingStatus', parkingStatus);
            formData.append('mapX', mapX);
            formData.append('mapY', mapY);

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
                    alert(`✅ A praia "${data.praia.name}" foi cadastrada com sucesso!`);
                    addBeachForm.reset();
                    window.closeAddBeachModal();
                    await fetchPraias();
                } else {
                    const data = await res.json();
                    alert(data.error || 'Erro ao cadastrar praia.');
                }
            } catch (err) {
                console.error('Erro ao cadastrar:', err);
                alert('Erro de conexão ao cadastrar nova praia.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            }
        });
    }

    // Inicialização
    renderCatalog();
    fetchPraias();
});
