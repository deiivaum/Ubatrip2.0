const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'ubatrip_super_secret_jwt_token_2026';

// Registro
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    try {
        const userExists = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'E-mail já cadastrado.' });
        }

        // Criptografia de senha com bcrypt
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // O primeiro usuário pode ser admin por conveniência, ou padrão 'user'
        const countRes = await db.query('SELECT COUNT(*) FROM users');
        const role = parseInt(countRes.rows[0].count) === 0 ? 'admin' : 'user';

        const newUser = await db.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
            [name, email, hashedPassword, role]
        );

        res.status(201).json({ 
            message: 'Usuário cadastrado com sucesso!', 
            user: newUser.rows[0] 
        });
    } catch (err) {
        console.error('Erro de autenticação:', err.message || err);
        if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))) {
            return res.status(503).json({ 
                error: 'Banco de dados PostgreSQL desconectado. Inicie o Docker Desktop com o comando "docker-compose up -d".' 
            });
        }
        res.status(500).json({ error: 'Erro no servidor ao registrar usuário.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    try {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Credenciais inválidas.' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Credenciais inválidas.' });
        }

        // Geração do token JWT (válido por 30 dias para conveniência do usuário)
        const token = jwt.sign(
            { id: user.id, role: user.role, name: user.name }, 
            JWT_SECRET, 
            { expiresIn: '30d' }
        );

        res.json({ 
            message: 'Login realizado com sucesso', 
            token, 
            user: { id: user.id, name: user.name, role: user.role } 
        });
    } catch (err) {
        console.error('Erro de login:', err.message || err);
        if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))) {
            return res.status(503).json({ 
                error: 'Banco de dados PostgreSQL desconectado. Inicie o Docker Desktop com o comando "docker-compose up -d".' 
            });
        }
        res.status(500).json({ error: 'Erro no servidor ao fazer login.' });
    }
});

module.exports = router;
