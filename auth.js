(() => {
  const ADMIN = { username: 'admin', password: 'Admin@123' };
  const SESSION_KEY = 'medishop-admin-session';

  const loginScreen = document.getElementById('login-screen');
  const app         = document.getElementById('app');
  const form        = document.getElementById('login-form');
  const userInput   = document.getElementById('login-user');
  const passInput   = document.getElementById('login-pass');
  const errorBox    = document.getElementById('login-error');
  const toggleBtn   = document.getElementById('toggle-pass');
  const eyeIcon     = document.getElementById('eye-icon');
  const logoutBtn   = document.getElementById('logout-btn');

  function showError(msg) { errorBox.textContent = msg; errorBox.classList.remove('hidden'); }

  function showApp() {
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function showLogin() {
    app.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    form.reset();
    errorBox.classList.add('hidden');
    userInput.focus();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) return showError('Please enter both username and password.');
    if (username === ADMIN.username && password === ADMIN.password) {
      sessionStorage.setItem(SESSION_KEY, '1');
      passInput.value = '';
      showApp();
    } else {
      passInput.value = '';
      showError('Invalid username or password. Please try again.');
      passInput.focus();
    }
  });

  toggleBtn.addEventListener('click', () => {
    const hidden = passInput.type === 'password';
    passInput.type = hidden ? 'text' : 'password';
    eyeIcon.textContent = hidden ? 'visibility_off' : 'visibility';
  });

  logoutBtn.addEventListener('click', () => {
    if (!confirm('Sign out of Medishop Pharmacy?')) return;
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  });

  if (sessionStorage.getItem(SESSION_KEY) === '1') showApp();
  else showLogin();
})();