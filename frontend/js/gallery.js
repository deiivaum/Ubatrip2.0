var GALLERY_API = (window.API_URL || '/api') + '/gallery';

document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = checkAuth();
    const uploadSection = document.getElementById('upload-section');
    const loginPrompt = document.getElementById('login-prompt');
    const uploadForm = document.getElementById('upload-form');
    const galleryGrid = document.getElementById('gallery-grid');

    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');
    const modalCaption = document.getElementById('modal-caption');
    const modalAuthor = document.getElementById('modal-author');

    if (token) {
        if (uploadSection) uploadSection.style.display = 'block';
        if (loginPrompt) loginPrompt.style.display = 'none';
    }

    // Modal para expandir imagem
    window.openImageModal = function(src, caption, author) {
        if (!modal) return;
        modalImg.src = src;
        modalCaption.textContent = caption || 'Foto da Comunidade UbaTrip';
        modalAuthor.textContent = author ? `Enviada por: ${author}` : '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Trava scroll de fundo
    };

    window.closeImageModal = function() {
        if (!modal) return;
        modal.classList.remove('active');
        document.body.style.overflow = 'auto'; // Restaura scroll
    };

    // Fechar modal ao pressionar tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
            window.closeImageModal();
        }
    });

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

                const fullUrl = `http://localhost:3000/uploads/${img.filename}`;
                const safeDesc = (img.description || 'Foto em Ubatuba').replace(/'/g, "\\'");
                const safeAuthor = (img.author || 'Viajante').replace(/'/g, "\\'");

                item.innerHTML = `
                    <div class="gallery-img-clickable" onclick="openImageModal('${fullUrl}', '${safeDesc}', '${safeAuthor}')" title="Clique para expandir a foto">
                        <img src="${fullUrl}" alt="${img.description || 'Foto de Ubatuba'}" loading="lazy">
                        <div class="gallery-zoom-hint">🔍 Expandir</div>
                    </div>
                    <div class="info">
                        <p class="desc">${img.description || 'Sem descrição'}</p>
                        <p class="author">Enviado por: <strong>${img.author}</strong></p>
                    </div>
                    ${deleteBtn}
                `;
                galleryGrid.appendChild(item);
            });
        } catch (err) {
            console.error('Erro ao carregar imagens:', err);
        }
    }

    loadImages();

    // Submissão do formulário de upload
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fileInput = document.getElementById('image-file');
            const descInput = document.getElementById('image-desc');
            
            if (!fileInput.files[0]) {
                alert('Por favor, selecione uma imagem.');
                return;
            }

            const formData = new FormData();
            formData.append('image', fileInput.files[0]);
            formData.append('description', descInput.value);

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
                    loadImages();
                } else {
                    const data = await res.json();
                    alert(data.error || 'Erro ao enviar a imagem.');
                }
            } catch (err) {
                alert('Erro na comunicação com o servidor.');
            }
        });
    }

    // Exclusão de foto
    window.deleteImage = async function(id) {
        if (!confirm('Tem certeza que deseja excluir esta foto?')) return;
        
        try {
            const res = await fetch(`${GALLERY_API}/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': token
                }
            });
            
            if (res.ok) {
                loadImages();
            } else {
                const data = await res.json();
                alert(data.error || 'Erro ao deletar imagem.');
            }
        } catch (err) {
            alert('Erro de conexão ao excluir.');
        }
    };
});
