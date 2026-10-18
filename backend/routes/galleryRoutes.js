const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');
const fs = require('fs');

// Cria pasta uploads se não existir
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// Apenas imagens
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Apenas imagens são permitidas!'), false);
    }
};

const upload = multer({ 
    storage, 
    limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB
    fileFilter 
});

const { getPraiasData, savePraiasData } = require('../config/praiasHelper');

// Buscar todas as imagens da galeria (Público)
router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT images.id, images.filename, images.description, images.user_id, images.praia_id, images.praia_name, users.name as author 
            FROM images 
            JOIN users ON images.user_id = users.id 
            ORDER BY images.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar imagens.' });
    }
});

// Buscar imagens da galeria de uma praia específica (Público)
router.get('/praia/:praiaId', async (req, res) => {
    const { praiaId } = req.params;
    try {
        const result = await db.query(`
            SELECT images.id, images.filename, images.description, images.user_id, images.praia_id, images.praia_name, users.name as author 
            FROM images 
            JOIN users ON images.user_id = users.id 
            WHERE images.praia_id = $1
            ORDER BY images.created_at DESC
        `, [praiaId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar imagens da praia.' });
    }
});

// Upload de imagem com tópico de praia (Usuário logado)
router.post('/', verifyToken, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    const { description, praia_id } = req.body;
    let praiaName = null;
    let validPraiaId = null;

    if (praia_id && typeof praia_id === 'string' && praia_id.trim() !== '') {
        const praias = getPraiasData();
        const praia = praias.find(p => p.id === praia_id.trim());
        if (praia) {
            validPraiaId = praia.id;
            praiaName = praia.name;
        }
    }

    try {
        const result = await db.query(
            'INSERT INTO images (user_id, filename, description, praia_id, praia_name) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.user.id, req.file.filename, description || '', validPraiaId, praiaName]
        );
        const savedImage = result.rows[0];

        // Se uma praia foi associada, vincula a foto na descrição da praia em praias.json
        if (validPraiaId) {
            try {
                const praias = getPraiasData();
                const targetPraia = praias.find(p => p.id === validPraiaId);
                if (targetPraia) {
                    if (!targetPraia.images) targetPraia.images = [];
                    targetPraia.images.push({
                        url: `http://localhost:3000/uploads/${req.file.filename}`,
                        caption: description && description.trim() 
                            ? description.trim() 
                            : `Foto enviada por ${req.user.name || 'comunidade'} na ${targetPraia.name}`,
                        author: req.user.name || 'Comunidade UbaTrip',
                        community: true,
                        gallery_image_id: savedImage.id,
                        filename: req.file.filename
                    });
                    savePraiasData(praias);
                }
            } catch (syncErr) {
                console.warn('Aviso: Falha ao sincronizar nova imagem com a praia:', syncErr);
            }
        }

        res.status(201).json(savedImage);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao salvar imagem.' });
    }
});

// Deletar imagem (Dono da imagem ou Admin)
router.delete('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const imageResult = await db.query('SELECT * FROM images WHERE id = $1', [id]);
        if (imageResult.rows.length === 0) {
            return res.status(404).json({ error: 'Imagem não encontrada.' });
        }

        const image = imageResult.rows[0];
        
        // Permite se for admin ou o próprio usuário que enviou
        if (req.user.role !== 'admin' && req.user.id !== image.user_id) {
            return res.status(403).json({ error: 'Sem permissão para deletar esta imagem.' });
        }

        await db.query('DELETE FROM images WHERE id = $1', [id]);
        
        // Sincroniza exclusão removendo a foto de praias.json caso esteja vinculada
        try {
            const praias = getPraiasData();
            let changed = false;
            praias.forEach(p => {
                if (p.images && Array.isArray(p.images)) {
                    const beforeLen = p.images.length;
                    p.images = p.images.filter(img => {
                        if (img.gallery_image_id && String(img.gallery_image_id) === String(image.id)) return false;
                        if (img.filename && img.filename === image.filename) return false;
                        if (img.url && img.url.includes(image.filename)) return false;
                        return true;
                    });
                    if (p.images.length !== beforeLen) changed = true;
                }
            });
            if (changed) {
                savePraiasData(praias);
            }
        } catch (syncErr) {
            console.warn('Aviso ao sincronizar exclusão com praias.json:', syncErr);
        }

        // Remove arquivo do disco
        const filePath = path.join(uploadsDir, image.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ message: 'Imagem deletada com sucesso.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao deletar imagem.' });
    }
});

module.exports = router;
