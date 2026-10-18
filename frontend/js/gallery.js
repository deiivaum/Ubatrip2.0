var GALLERY_API = (window.API_URL || '/api') + '/gallery';

document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = checkAuth();
    const uploadSection = document.getElementById('upload-section');
    const loginPrompt = document.getElementById('login-prompt');
    const uploadForm = document.getElementById('upload-form');
    const galleryGrid = document.getElementById('gallery-grid');

    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');

    if (token) {
        if (uploadSection) uploadSection.style.display = 'block';
        if (loginPrompt) loginPrompt.style.display = 'none';
    }

    function resizeModalImage() {
        if (!modalImg || !modal || !modal.classList.contains('active')) return;
        const natW = modalImg.naturalWidth || 1000;
        const natH = modalImg.naturalHeight || 700;
        const aspect = natW / natH;

        // Limites confortáveis para ocupar área expressiva da tela
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

    // Modal para expandir APENAS a imagem em tamanho grande com X para voltar
    window.openImageModal = function(src) {
        if (!modal || !modalImg) return;
        modalImg.src = src;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Trava scroll de fundo
        if (modalImg.complete) {
            resizeModalImage();
        }
    };

    window.closeImageModal = function() {
        if (!modal) return;
        modal.classList.remove('active');
        document.body.style.overflow = 'auto'; // Restaura scroll
        if (modalImg) {
            modalImg.src = '';
            modalImg.style.width = '';
            modalImg.style.height = '';
        }
    };

    // Fechar modal ao pressionar tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
            window.closeImageModal();
        }
    });

    // Popula o seletor de praias para tópico
    async function initBeachSelector() {
        const praiaSelect = document.getElementById('image-praia');
        if (!praiaSelect) return;

        let praias = [];
        try {
            const res = await fetch((window.API_URL || '/api') + '/praias');
            if (res.ok) {
                praias = await res.json();
            }
        } catch (e) {
            console.warn('Usando dados de praias em cache/local:', e);
        }

        if ((!praias || praias.length === 0) && typeof PRAIAS_DATA !== 'undefined') {
            praias = PRAIAS_DATA;
        }

        if (!praias || praias.length === 0) return;

        praiaSelect.innerHTML = '<option value="">-- Selecione uma praia (aparecerá na descrição da praia) --</option>';

        const regionNames = {
            norte: 'Região Norte (Ex: Itamambuca, Félix, Prumirim...)',
            centro: 'Região Central (Ex: Praia Grande, Tenório, Toninhas...)',
            sul: 'Região Sul (Ex: Lazaro, Sununga, Maranduba...)',
            ilhas: 'Ilhas de Ubatuba (Ex: Couves, Anchieta, Prumirim...)'
        };

        const groups = {
            norte: [],
            centro: [],
            sul: [],
            ilhas: [],
            outras: []
        };

        praias.forEach(p => {
            const reg = (p.region || 'centro').toLowerCase();
            if (groups[reg]) {
                groups[reg].push(p);
            } else {
                groups.outras.push(p);
            }
        });

        Object.keys(groups).forEach(regKey => {
            const list = groups[regKey];
            if (list.length > 0) {
                list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
                const optgroup = document.createElement('optgroup');
                optgroup.label = regionNames[regKey] || 'Outras Praias';
                list.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.name;
                    optgroup.appendChild(opt);
                });
                praiaSelect.appendChild(optgroup);
            }
        });

        // Se a URL tiver ?praia=id, já seleciona automaticamente
        const urlParams = new URLSearchParams(window.location.search);
        const preselectedPraia = urlParams.get('praia');
        if (preselectedPraia) {
            praiaSelect.value = preselectedPraia;
        }
    }

    initBeachSelector();

    // Carregar todas as fotos cadastradas
    async function loadImages() {
        try {
            const res = await fetch(GALLERY_API);
            const images = await res.json();
            
            if (!galleryGrid) return;
            galleryGrid.innerHTML = '';

            if (!images || images.length === 0) {
                galleryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 1rem; padding: 2rem 0;">Nenhuma imagem cadastrada ainda. Seja o primeiro a compartilhar uma foto de Ubatuba!</p>';
                return;
            }

            images.forEach(img => {
                const item = document.createElement('div');
                item.className = 'gallery-item';
                
                let deleteBtn = '';
                // Usuário que enviou ou Admin podem deletar
                if (user && (user.role === 'admin' || user.id === img.user_id)) {
                    deleteBtn = `<button class="delete-btn" onclick="event.stopPropagation(); deleteImage(${img.id})">Excluir</button>`;
                }

                let beachBadgeHtml = '';
                if (img.praia_name && img.praia_id) {
                    beachBadgeHtml = `
                        <a href="praia.html?id=${encodeURIComponent(img.praia_id)}" class="gallery-topic-badge" title="Ver detalhes e fotos da ${img.praia_name}">
                            🏖️ ${img.praia_name} &rarr;
                        </a>
                    `;
                }

                const fullUrl = `http://localhost:3000/uploads/${img.filename}`;

                item.innerHTML = `
                    <div class="gallery-img-clickable" onclick="openImageModal('${fullUrl}')" title="Clique para expandir a foto">
                        <img src="${fullUrl}" alt="${img.description || img.praia_name || 'Foto de Ubatuba'}" loading="lazy">
                        <div class="gallery-zoom-hint">🔍 Expandir Foto</div>
                    </div>
                    <div class="info">
                        ${beachBadgeHtml}
                        <p class="desc">${img.description || (img.praia_name ? 'Foto registrada na ' + img.praia_name : 'Sem descrição')}</p>
                        <p class="author">Enviado por: <strong>${img.author}</strong></p>
                    </div>
                    ${deleteBtn}
                `;
                galleryGrid.appendChild(item);
            });
        } catch (err) {
            console.error('Erro ao carregar imagens:', err);
            if (typeof window.showToast === 'function') {
                window.showToast('Erro ao carregar as imagens da galeria.', 'error');
            }
        }
    }

    loadImages();

    // Submissão do formulário de upload
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fileInput = document.getElementById('image-file');
            const descInput = document.getElementById('image-desc');
            const praiaSelect = document.getElementById('image-praia');
            
            if (!fileInput.files[0]) {
                if (typeof window.showToast === 'function') {
                    window.showToast('Por favor, selecione uma imagem para enviar.', 'error');
                } else {
                    alert('Por favor, selecione uma imagem.');
                }
                return;
            }

            const formData = new FormData();
            formData.append('image', fileInput.files[0]);
            formData.append('description', descInput.value);
            if (praiaSelect && praiaSelect.value) {
                formData.append('praia_id', praiaSelect.value);
            }

            try {
                const res = await fetch(GALLERY_API, {
                    method: 'POST',
                    headers: {
                        'Authorization': token
                    },
                    body: formData
                });
                
                if (res.ok) {
                    fileInput.value = '';
                    descInput.value = '';
                    if (praiaSelect) praiaSelect.value = '';
                    if (typeof window.showToast === 'function') {
                        window.showToast('Foto enviada com sucesso para a galeria e praia!', 'success');
                    }
                    loadImages();
                } else {
                    const data = await res.json();
                    if (typeof window.showToast === 'function') {
                        window.showToast(data.error || 'Erro ao enviar a imagem.', 'error');
                    } else {
                        alert(data.error || 'Erro ao enviar a imagem.');
                    }
                }
            } catch (err) {
                if (typeof window.showToast === 'function') {
                    window.showToast('Erro de comunicação com o servidor ao enviar a foto.', 'error');
                } else {
                    alert('Erro na comunicação com o servidor.');
                }
            }
        });
    }

    // Exclusão de foto
    window.deleteImage = async function(id) {
        if (!confirm('Tem certeza que deseja excluir esta foto da galeria?')) return;
        
        try {
            const res = await fetch(`${GALLERY_API}/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': token
                }
            });
            
            if (res.ok) {
                if (typeof window.showToast === 'function') {
                    window.showToast('Foto excluída com sucesso!', 'success');
                }
                loadImages();
            } else {
                const data = await res.json();
                if (typeof window.showToast === 'function') {
                    window.showToast(data.error || 'Erro ao excluir a foto.', 'error');
                } else {
                    alert(data.error || 'Erro ao deletar imagem.');
                }
            }
        } catch (err) {
            if (typeof window.showToast === 'function') {
                window.showToast('Erro de conexão ao tentar excluir a foto.', 'error');
            } else {
                alert('Erro de conexão ao excluir.');
            }
        }
    };
});
