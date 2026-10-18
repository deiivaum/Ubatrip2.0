const fs = require('fs');
const path = require('path');

const dataFilePath = path.join(__dirname, '../data/praias.json');
const frontDataPath = path.join(__dirname, '../../frontend/js/praias-data.js');

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
    try {
        fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
        if (fs.existsSync(frontDataPath)) {
            fs.writeFileSync(frontDataPath, 'var PRAIAS_DATA = ' + JSON.stringify(data, null, 2) + ';\n', 'utf8');
        }
    } catch (e) {
        console.warn('Aviso ao salvar praias:', e.message);
    }
}

module.exports = {
    dataFilePath,
    getPraiasData,
    savePraiasData
};
