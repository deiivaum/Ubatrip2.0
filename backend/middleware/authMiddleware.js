const jwt = require('jsonwebtoken');

const PRIMARY_SECRET = process.env.JWT_SECRET || 'ubatrip_super_secret_jwt_token_2026';
const KNOWN_SECRETS = Array.from(new Set([
    PRIMARY_SECRET,
    'ubatrip_super_secret_jwt_token_2026',
    'super_secret_key_ubatrip',
    'chave_super_secreta_jwt_ubatrip_2026'
]));

const verifyToken = (req, res, next) => {
    let authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ error: 'Nenhum token fornecido. Faça login para continuar.' });
    }

    // Aceita com ou sem prefixo "Bearer", limpando qualquer repetição
    let token = String(authHeader).trim();
    while (token.toLowerCase().startsWith('bearer ')) {
        token = token.slice(7).trim();
    }

    if (!token) {
        return res.status(401).json({ error: 'Token malformatado ou ausente. Faça login novamente.' });
    }

    let decoded = null;
    let lastError = null;

    // Tenta validar contra a chave primária e segredos conhecidos
    for (const secret of KNOWN_SECRETS) {
        try {
            decoded = jwt.verify(token, secret);
            if (decoded) break;
        } catch (err) {
            lastError = err;
        }
    }

    if (decoded) {
        req.user = decoded;
        return next();
    }

    // Se o token expirou especificamente
    if (lastError && lastError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
            error: 'Sua sessão expirou. Por favor, faça login novamente para enviar fotos.',
            expired: true 
        });
    }

    return res.status(401).json({ 
        error: 'Sua sessão não é válida ou expirou. Por favor, faça login novamente.',
        expired: true 
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Requer privilégios de administrador.' });
    }
    next();
};

module.exports = { verifyToken, isAdmin };
