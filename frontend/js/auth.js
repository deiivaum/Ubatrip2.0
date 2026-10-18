window.API_URL = window.API_URL || '/api';
var API_URL = window.API_URL;

function checkAuth() {
    const token = localStorage.getItem('token');
    const userJson = localStorage.getItem('user');
    const authLinks = document.getElementById('auth-links');
    const drawerAuthLinks = document.getElementById('drawer-auth-links');
    const heroAuthBtn = document.getElementById('hero-auth-btn');

    let user = null;
    if (token && userJson) {
        user = JSON.parse(userJson);
        const roleBadge = user.role === 'admin' 
            ? '<span style="background: var(--olive-btn); color: #fff; font-size: 0.7rem; padding: 2px 7px; border-radius: 9999px; margin-left: 6px; text-transform: uppercase;">Admin</span>' 
            : '';
        
        const adminBtn = user.role === 'admin'
            ? `<a href="admin.html" class="btn-pill" style="padding: 0.35rem 0.9rem; font-size: 0.75rem; background: var(--text-primary); text-transform: none;">Painel Admin</a>`
            : '';

        const loggedHtml = `
            <span style="font-size: 0.85rem; font-weight: 500;">Olá, <strong>${user.name}</strong>${roleBadge}</span>
            ${adminBtn}
            <button onclick="logout()" class="btn-pill" style="padding: 0.35rem 1.1rem; font-size: 0.75rem;">Sair</button>
        `;

        if (authLinks) authLinks.innerHTML = loggedHtml;
        if (drawerAuthLinks) drawerAuthLinks.innerHTML = `
            ${user.role === 'admin' ? '<a href="admin.html" style="color: var(--olive-btn); font-weight: 600;">Painel Admin</a>' : ''}
            <div style="margin-top: 0.5rem;">${loggedHtml}</div>
        `;
        if (heroAuthBtn) {
            heroAuthBtn.textContent = 'Minha Galeria';
            heroAuthBtn.href = 'gallery.html';
        }
    } else {
        const guestHtml = `
            <a href="login.html" style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 500;">Login</a>
        `;
        if (authLinks) authLinks.innerHTML = guestHtml;
        if (drawerAuthLinks) {
            drawerAuthLinks.innerHTML = `
                <a href="login.html">Login</a>
                <a href="register.html">Cadastro</a>
            `;
        }
        if (heroAuthBtn) {
            heroAuthBtn.textContent = 'Cadastro';
            heroAuthBtn.href = 'register.html';
        }
    }

    return { token, user };
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Lógica do formulário de Cadastro
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const res = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });

                const data = await res.json();
                if (res.ok) {
                    alert('Cadastro realizado com sucesso! Faça login para continuar.');
                    window.location.href = 'login.html';
                } else {
                    alert(data.error || 'Erro ao realizar cadastro.');
                }
            } catch (err) {
                alert('Erro na conexão com o servidor.');
            }
        });
    }

    // Lógica do formulário de Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const res = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();
                if (res.ok) {
                    localStorage.setItem('token', `Bearer ${data.token}`);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    window.location.href = 'gallery.html';
                } else {
                    alert(data.error || 'Credenciais inválidas.');
                }
            } catch (err) {
                alert('Erro na conexão com o servidor.');
            }
        });
    }
});
