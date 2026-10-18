# 🌊 UbaTrip 2.0 - Guia & Plataforma Turística de Ubatuba

Projeto completo com sistema de autenticação de usuários (hierarquia Admin/User), CRUD de galeria de fotos exclusiva para membros e mapa interativo com pontos turísticos de Ubatuba.

---

## 🛠️ Tecnologias Utilizadas

- **Backend:** Node.js & Express
- **Banco de Dados:** PostgreSQL (driver `pg`)
- **Segurança:** Criptografia de senhas com `bcrypt` e autenticação com `jsonwebtoken` (JWT)
- **Uploads:** `multer`
- **Frontend:** HTML5, CSS3, JavaScript Vanilla
- **Mapa:** Leaflet.js integrado com OpenStreetMap

---

## 📁 Estrutura do Projeto

```text
ubatrip/
├── backend/
│   ├── config/
│   │   └── db.js            # Configuração e pool de conexão com o PostgreSQL
│   ├── middleware/
│   │   └── authMiddleware.js # Validação de token JWT e checagem de Admin
│   ├── routes/
│   │   ├── authRoutes.js    # Rotas de cadastro e login
│   │   └── galleryRoutes.js # Rotas de listagem, upload e exclusão de fotos
│   ├── uploads/             # Diretório onde as imagens enviadas são armazenadas
│   ├── .env                 # Variáveis de ambiente
│   ├── init.sql             # Script SQL de criação das tabelas
│   └── server.js            # Servidor Express principal
├── frontend/
│   ├── css/
│   │   └── style.css        # Folha de estilos moderna e responsiva
│   ├── js/
│   │   ├── auth.js          # Lógica de login, cadastro e controle de sessão
│   │   ├── gallery.js       # Lógica de listagem e envio de imagens
│   │   └── main.js          # Inicialização e manipulação do mapa interativo
│   ├── gallery.html         # Página exclusiva da Galeria
│   ├── index.html           # Página principal com o Mapa de Ubatuba
│   ├── login.html           # Formulário de Login
│   └── register.html        # Formulário de Cadastro
├── docker-compose.yml       # Orquestração do PostgreSQL via Docker
└── package.json             # Dependências e scripts do Node.js
```

---

## 🚀 Como Executar o Projeto

### 1. Iniciar o Banco de Dados (PostgreSQL)

Você pode usar o **Docker** ou uma instância local do PostgreSQL.

#### Opção A: Usando Docker (Recomendado)
Execute na raiz da pasta `ubatrip`:
```bash
docker-compose up -d
```
Isso iniciará o banco na porta `5432` e rodará automaticamente o script `backend/init.sql`.

#### Opção B: PostgreSQL Local
Crie um banco de dados chamado `ubatrip_db` e execute os comandos contidos em `backend/init.sql`. Atualize as credenciais no arquivo `backend/.env`, se necessário.

---

### 2. Instalar as Dependências

Na raiz do projeto (`ubatrip`), rode:
```bash
npm install
```

---

### 3. Iniciar o Servidor

```bash
npm start
```

O servidor iniciará em `http://localhost:3000`.

---

## 🌐 Funcionalidades

1. **Página Inicial (`index.html`):**
   - Apresentação sobre Ubatuba.
   - Mapa funcional via **Leaflet**: inclui marcadores das praias e atrações (Praia Grande, Praia do Félix, Itamambuca, etc.) e permite que o visitante clique em qualquer lugar para selecionar e ver as coordenadas geográficas exatas.

2. **Cadastro & Login com Hierarquia:**
   - Senhas criptografadas com `bcrypt`.
   - Autenticação stateless via `JWT`.
   - O primeiro usuário cadastrado se torna automaticamente **Admin**. Os seguintes são criados como usuários normais (`user`).

3. **Galeria de Imagens (`gallery.html`):**
   - Acesso público para visualização das fotos enviadas pela comunidade.
   - Apenas usuários logados podem enviar fotos com legendas.
   - O autor da imagem pode excluí-la.
   - **Administradores** podem excluir qualquer imagem da galeria.
