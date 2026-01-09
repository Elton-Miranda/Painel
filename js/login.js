
// ==========================
// Configuração
// ==========================
const AUTH_URL = 'http://127.0.0.1:5500/index.htm'; // SUBSTITUA pelo seu endpoint
const DASHBOARD_URL = 'index.html';

// ==========================
// Utilitários
// ==========================
function setAuthToken(token, remember){
  try{
    if(remember){
      localStorage.setItem('warroom_token', token);
    }else{
      sessionStorage.setItem('warroom_token', token);
    }
  }catch(e){
    console.warn('Storage indisponível:', e);
  }
}
function getAuthToken(){
  return localStorage.getItem('warroom_token') || sessionStorage.getItem('warroom_token');
}
function clearAuthToken(){
  localStorage.removeItem('warroom_token');
  sessionStorage.removeItem('warroom_token');
}

// ==========================
// UI & Validação
// ==========================
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  const emailErr = document.getElementById('emailError');
  const passErr = document.getElementById('passwordError');
  const feedback = document.getElementById('loginFeedback');
  const toggleBtn = document.getElementById('togglePassword');
  const rememberEl = document.getElementById('rememberMe');

  // Se já existe token, vai para o dashboard
  const existing = getAuthToken();
  if(existing){
    window.location.href = DASHBOARD_URL;
    return;
  }

  toggleBtn.addEventListener('click', () => {
    const isPw = passEl.getAttribute('type') === 'password';
    passEl.setAttribute('type', isPw ? 'text' : 'password');
    toggleBtn.textContent = isPw ? '🙈' : '👁️';
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    emailErr.textContent = '';
    passErr.textContent = '';
    feedback.textContent = '';

    const email = emailEl.value.trim();
    const password = passEl.value;

    let valid = true;
    if(!email){
      emailErr.textContent = 'Informe seu e‑mail.';
      valid = false;
    }else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      emailErr.textContent = 'E‑mail inválido.';
      valid = false;
    }
    if(!password || password.length < 6){
      passErr.textContent = 'Senha deve ter pelo menos 6 caracteres.';
      valid = false;
    }
    if(!valid) return;

    // desabilita botão durante login
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try{
      // Chamada ao endpoint de autenticação
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if(!res.ok){
        throw new Error(`Falha no login: HTTP ${res.status}`);
      }
      const json = await res.json();

      // Espera { token: "...", user:{...} }
      if(!json.token){
        throw new Error('Resposta sem token.');
      }

      setAuthToken(json.token, rememberEl.checked);

      // (Opcional) guardar dados básicos do usuário
      sessionStorage.setItem('warroom_user', JSON.stringify(json.user || { email }));

      // Redireciona
      window.location.href = DASHBOARD_URL;
    }catch(err){
      console.error(err);
      feedback.textContent = 'Não foi possível autenticar. Verifique suas credenciais.';
    }finally{
      btn.disabled = false;
      btn.textContent = 'Acessar';
    }
  });
});
