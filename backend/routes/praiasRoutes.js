const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

const dataFilePath = path.join(__dirname, '../data/praias.json');
const uploadsDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage para fotos das praias
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'praia-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

function getPraiasData() {
    try {
        if (!fs.existsSync(dataFilePath)) return [];
        const raw = fs.readFileSync(dataFilePath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('Erro ao ler praias.json:', e);
        return [];
    }
}

function savePraiasData(data) {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
    try {
        const frontDataPath = path.join(__dirname, '../../frontend/js/praias-data.js');
        if (fs.existsSync(frontDataPath)) {
            fs.writeFileSync(frontDataPath, 'var PRAIAS_DATA = ' + JSON.stringify(data, null, 2) + ';\n', 'utf8');
        }
    } catch (e) {
        console.warn('Aviso: Não foi possível sincronizar praias-data.js:', e.message);
    }
}

function slugify(text) {
    return text.toString().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// 1. Listar todas as praias
router.get('/', (req, res) => {
    const praias = getPraiasData();
    res.json(praias);
});

// 2. Detalhes de uma praia
router.get('/:id', (req, res) => {
    const praias = getPraiasData();
    const praia = praias.find(p => p.id === req.params.id);
    if (!praia) return res.status(404).json({ error: 'Praia não encontrada.' });
    res.json(praia);
});

// 3. Cadastrar nova praia diretamente pelo site
router.post('/', upload.single('image'), (req, res) => {
    const { 
        name, subtitle, region, shortDesc, fullDesc, 
        accessTipo, accessDesc, parkingStatus, parkingDesc, 
        infrastructure, tags, imageUrl, mapX, mapY,
        coords, areaCoords
    } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'O nome da praia é obrigatório.' });
    }

    const praias = getPraiasData();
    let baseId = slugify(name);
    let finalId = baseId;
    let counter = 1;
    while (praias.some(p => p.id === finalId)) {
        finalId = `${baseId}-${counter++}`;
    }

    // Imagem principal
    let photoUrl = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80';
    if (req.file) {
        photoUrl = `http://localhost:3000/uploads/${req.file.filename}`;
    } else if (imageUrl && imageUrl.trim()) {
        photoUrl = imageUrl.trim();
    }

    const infraList = infrastructure 
        ? (Array.isArray(infrastructure) ? infrastructure : infrastructure.split(',').map(s => s.trim()).filter(Boolean))
        : ['Quiosques de praia', 'Duchas e banheiros'];

    const tagsList = tags 
        ? (Array.isArray(tags) ? tags : tags.split(',').map(s => s.trim()).filter(Boolean))
        : ['Ubatuba', region || 'Litoral'];

    // Coordenadas geográficas reais (Latitude / Longitude de Ubatuba)
    let parsedCoords = [-23.4332, -45.0711];
    if (coords) {
        if (typeof coords === 'string') {
            try { parsedCoords = JSON.parse(coords); } catch(e) {}
        } else if (Array.isArray(coords)) {
            parsedCoords = coords;
        }
    }

    let parsedAreaCoords = null;
    if (areaCoords) {
        if (typeof areaCoords === 'string') {
            try { parsedAreaCoords = JSON.parse(areaCoords); } catch(e) {}
        } else if (Array.isArray(areaCoords)) {
            parsedAreaCoords = areaCoords;
        }
    }

    // Se não tiver área demarcada, gera um polígono padrão em volta do ponto
    if (!parsedAreaCoords && Array.isArray(parsedCoords) && parsedCoords.length === 2) {
        const lat = parsedCoords[0];
        const lng = parsedCoords[1];
        const dLat = 0.0035;
        const dLng = 0.0045;
        parsedAreaCoords = [
            [lat + dLat, lng - dLng],
            [lat + dLat, lng + dLng],
            [lat - dLat, lng + dLng],
            [lat - dLat, lng - dLng]
        ];
    }

    const parsedX = parseFloat(mapX) || 50;
    const parsedY = parseFloat(mapY) || 50;

    const novaPraia = {
        id: finalId,
        name: name.trim(),
        subtitle: subtitle ? subtitle.trim() : `Praia de Ubatuba - Região ${region || 'Central'}`,
        region: region || 'centro',
        coords: parsedCoords,
        areaCoords: parsedAreaCoords,
        mapX: Math.round(parsedX * 10) / 10,
        mapY: Math.round(parsedY * 10) / 10,
        shortDesc: shortDesc ? shortDesc.trim() : 'Uma das belas praias de Ubatuba com paisagens preservadas.',
        fullDesc: fullDesc ? fullDesc.trim() : `A ${name} é uma das praias do litoral de Ubatuba, cercada pela Mata Atlântica e águas cristalinas ideais para banho e contemplação.`,
        access: {
            tipo: accessTipo ? accessTipo.trim() : 'Asfaltado e direto',
            descricao: accessDesc ? accessDesc.trim() : 'Fácil acesso a partir da Rodovia Rio-Santos (BR-101).'
        },
        parking: {
            status: parkingStatus ? parkingStatus.trim() : 'Zona Azul / Estacionamento local',
            descricao: parkingDesc ? parkingDesc.trim() : 'Vagas na orla sujeitas a Zona Azul ou estacionamentos nas redondezas.'
        },
        infrastructure: infraList,
        tags: tagsList,
        images: [
            {
                url: photoUrl,
                caption: `Vista panorâmica da ${name}`
            }
        ],
        created_at: new Date().toISOString()
    };

    praias.unshift(novaPraia);
    savePraiasData(praias);

    res.status(201).json({
        message: 'Praia cadastrada com sucesso!',
        praia: novaPraia
    });
});

// 3.1 Atualizar área demarcada de uma praia existente
router.put('/:id/area', (req, res) => {
    const { id } = req.params;
    const { coords, areaCoords } = req.body;
    const praias = getPraiasData();
    const praia = praias.find(p => p.id === id);
    if (!praia) return res.status(404).json({ error: 'Praia não encontrada.' });

    if (coords && Array.isArray(coords)) {
        praia.coords = coords;
    }
    if (areaCoords === null || (Array.isArray(areaCoords) && areaCoords.length === 0)) {
        praia.areaCoords = null;
    } else if (areaCoords && Array.isArray(areaCoords)) {
        praia.areaCoords = areaCoords;
    }

    savePraiasData(praias);
    res.json({
        message: 'Área da praia atualizada com sucesso!',
        praia
    });
});

// 3.2 Atualizar coordenadas geográficas (GPS) e área da praia via Painel Admin
router.put('/:id/coords', (req, res) => {
    const { id } = req.params;
    let { coords, areaCoords, lat, lng } = req.body;
    const praias = getPraiasData();
    const praia = praias.find(p => p.id === id);
    if (!praia) return res.status(404).json({ error: 'Praia não encontrada.' });

    let finalCoords = null;
    if (lat !== undefined && lng !== undefined) {
        finalCoords = [Number(parseFloat(lat).toFixed(6)), Number(parseFloat(lng).toFixed(6))];
    } else if (coords) {
        if (typeof coords === 'string') {
            try { coords = JSON.parse(coords); } catch (e) {}
        }
        if (Array.isArray(coords) && coords.length === 2) {
            finalCoords = [Number(parseFloat(coords[0]).toFixed(6)), Number(parseFloat(coords[1]).toFixed(6))];
        }
    }

    if (!finalCoords || isNaN(finalCoords[0]) || isNaN(finalCoords[1])) {
        return res.status(400).json({ error: 'Coordenadas inválidas. Forneça latitude e longitude válidas.' });
    }

    praia.coords = finalCoords;

    if (areaCoords) {
        let parsedArea = areaCoords;
        if (typeof areaCoords === 'string') {
            try { parsedArea = JSON.parse(areaCoords); } catch (e) {}
        }
        if (Array.isArray(parsedArea) && parsedArea.length >= 3) {
            praia.areaCoords = parsedArea;
        }
    }

    savePraiasData(praias);

    // Sincroniza também no frontend/js/praias-data.js para manter paridade
    try {
        const frontDataPath = path.join(__dirname, '../../frontend/js/praias-data.js');
        if (fs.existsSync(frontDataPath)) {
            fs.writeFileSync(frontDataPath, 'var PRAIAS_DATA = ' + JSON.stringify(praias, null, 2) + ';\n', 'utf8');
        }
    } catch (e) {
        console.warn('Aviso: Não foi possível sincronizar praias-data.js:', e.message);
    }

    res.json({
        message: `Coordenadas da praia "${praia.name}" atualizadas com sucesso!`,
        praia
    });
});

// 4. Alterar / Adicionar imagem de uma praia
router.put('/:id/image', upload.single('image'), (req, res) => {
    const { id } = req.params;
    let { imageIndex, imageUrl, caption, action } = req.body;
    
    const praias = getPraiasData();
    const praia = praias.find(p => p.id === id);
    if (!praia) return res.status(404).json({ error: 'Praia não encontrada.' });

    let finalUrl = '';
    if (req.file) {
        finalUrl = `http://localhost:3000/uploads/${req.file.filename}`;
    } else if (imageUrl) {
        finalUrl = imageUrl.trim();
    }

    if (!finalUrl && action !== 'delete') {
        return res.status(400).json({ error: 'Forneça um arquivo de imagem ou uma URL válida.' });
    }

    if (!praia.images) praia.images = [];
    const idx = parseInt(imageIndex);

    if (action === 'delete') {
        if (idx >= 0 && idx < praia.images.length) {
            praia.images.splice(idx, 1);
        }
    } else if (action === 'add' || idx === -1 || isNaN(idx)) {
        praia.images.push({
            url: finalUrl,
            caption: caption ? caption.trim() : `${praia.name}`
        });
    } else if (idx >= 0 && idx < praia.images.length) {
        praia.images[idx] = {
            url: finalUrl,
            caption: caption ? caption.trim() : praia.images[idx].caption
        };
    } else {
        praia.images.push({
            url: finalUrl,
            caption: caption ? caption.trim() : `${praia.name}`
        });
    }

    savePraiasData(praias);

    res.json({
        message: 'Imagem da praia atualizada com sucesso!',
        praia
    });
});

// 5. Excluir praia
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    let praias = getPraiasData();
    const initLen = praias.length;
    praias = praias.filter(p => p.id !== id);
    if (praias.length === initLen) {
        return res.status(404).json({ error: 'Praia não encontrada.' });
    }
    savePraiasData(praias);
    res.json({ message: 'Praia excluída com sucesso!' });
});

module.exports = router;
