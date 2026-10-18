const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const localDbPath = path.join(dataDir, 'local_db.json');

function loadLocalDb() {
    if (!fs.existsSync(localDbPath)) {
        const initial = { users: [], images: [], userSeq: 1, imageSeq: 1 };
        fs.writeFileSync(localDbPath, JSON.stringify(initial, null, 2), 'utf8');
        return initial;
    }
    try {
        return JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
    } catch {
        return { users: [], images: [], userSeq: 1, imageSeq: 1 };
    }
}

function saveLocalDb(data) {
    fs.writeFileSync(localDbPath, JSON.stringify(data, null, 2), 'utf8');
}

let isPgAvailable = null;

const pool = new Pool({
  user: process.env.DB_USER || 'ubatrip_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'ubatrip_db',
  password: process.env.DB_PASSWORD || 'ubatrip_password',
  port: process.env.DB_PORT || 5432,
  connectionTimeoutMillis: 1500,
});

async function checkPg() {
    if (isPgAvailable !== null) return isPgAvailable;
    try {
        const client = await pool.connect();
        client.release();
        isPgAvailable = true;
        console.log('✅ [Banco de Dados] Conectado ao PostgreSQL com sucesso na porta 5432!');
        return true;
    } catch (err) {
        isPgAvailable = false;
        console.log('ℹ️ [Banco de Dados] PostgreSQL indisponível. Ativando banco local persistente (backend/data/local_db.json) automaticamente.');
        return false;
    }
}

// Fallback local caso o Docker/PostgreSQL não esteja rodando
function queryLocal(text, params = []) {
    const db = loadLocalDb();
    const cleanText = text.trim();

    // 1. SELECT * FROM users WHERE email = $1
    if (cleanText.includes('FROM users WHERE email =')) {
        const email = params[0] || '';
        const rows = db.users.filter(u => u.email.toLowerCase() === email.toLowerCase());
        return { rows, rowCount: rows.length };
    }

    // 2. SELECT COUNT(*) FROM users
    if (cleanText.includes('SELECT COUNT(*)') && cleanText.includes('FROM users')) {
        return { rows: [{ count: db.users.length.toString() }], rowCount: 1 };
    }

    // 3. INSERT INTO users ... RETURNING id, name, email, role
    if (cleanText.startsWith('INSERT INTO users')) {
        const [name, email, password, role] = params;
        const newUser = {
            id: db.userSeq++,
            name,
            email,
            password,
            role: role || (db.users.length === 0 ? 'admin' : 'user'),
            created_at: new Date().toISOString()
        };
        db.users.push(newUser);
        saveLocalDb(db);
        return { rows: [newUser], rowCount: 1 };
    }

    // 4. SELECT images ... JOIN users ...
    if (cleanText.includes('FROM images') && cleanText.includes('JOIN users')) {
        const rows = db.images.map(img => {
            const user = db.users.find(u => u.id === img.user_id) || { name: 'Viajante' };
            return {
                id: img.id,
                filename: img.filename,
                description: img.description,
                user_id: img.user_id,
                author: user.name,
                created_at: img.created_at
            };
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return { rows, rowCount: rows.length };
    }

    // 5. INSERT INTO images ...
    if (cleanText.startsWith('INSERT INTO images')) {
        const [user_id, filename, description] = params;
        const newImg = {
            id: db.imageSeq++,
            user_id: parseInt(user_id),
            filename,
            description: description || '',
            created_at: new Date().toISOString()
        };
        db.images.push(newImg);
        saveLocalDb(db);
        return { rows: [newImg], rowCount: 1 };
    }

    // 6. SELECT * FROM images WHERE id = $1
    if (cleanText.includes('FROM images WHERE id =')) {
        const id = parseInt(params[0]);
        const rows = db.images.filter(img => img.id === id);
        return { rows, rowCount: rows.length };
    }

    // 7. DELETE FROM images WHERE id = $1
    if (cleanText.startsWith('DELETE FROM images WHERE id =')) {
        const id = parseInt(params[0]);
        const initLen = db.images.length;
        db.images = db.images.filter(img => img.id !== id);
        saveLocalDb(db);
        return { rows: [], rowCount: initLen - db.images.length };
    }

    return { rows: [], rowCount: 0 };
}

module.exports = {
    query: async (text, params) => {
        const pgUp = await checkPg();
        if (pgUp) {
            try {
                return await pool.query(text, params);
            } catch (err) {
                if (err.code === 'ECONNREFUSED') {
                    isPgAvailable = false;
                    return queryLocal(text, params);
                }
                throw err;
            }
        } else {
            return queryLocal(text, params);
        }
    }
};
