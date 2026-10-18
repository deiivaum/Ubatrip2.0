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

// Buscar todas as imagens da galeria (Público)
router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT images.id, images.filename, images.description, images.user_id, users.name as author 
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

// Upload de imagem (Usuário logado)
router.post('/', verifyToken, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    const { description } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO images (user_id, filename, description) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, req.file.filename, description || '']
        );
        res.status(201).json(result.rows[0]);
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
