// Password Protection for Studio Grow Workbook

const CORRECT_PASSWORD = 'lise-kuecker';
const AUTH_KEY = 'studio_grow_authenticated';

function checkAuthentication() {
  return sessionStorage.getItem(AUTH_KEY) === 'true';
}

function setAuthenticated() {
  sessionStorage.setItem(AUTH_KEY, 'true');
}

function showPasswordPrompt() {
  // Create password overlay - append to documentElement so it's always visible
  const overlay = document.createElement('div');
  overlay.id = 'password-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 99999;
  `;

  const promptBox = document.createElement('div');
  promptBox.style.cssText = `
    background: white;
    padding: 40px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    max-width: 400px;
    width: 90%;
    text-align: center;
  `;

  const title = document.createElement('h2');
  title.textContent = '50 New Members in 5 Days';
  title.style.cssText = `
    font-size: 28px;
    font-weight: 700;
    color: #FF6B35;
    margin-bottom: 20px;
    font-family: Georgia, serif;
  `;

  const subtitle = document.createElement('p');
  subtitle.textContent = 'Please enter the password to access';
  subtitle.style.cssText = `
    color: var(--color-text);
    margin-bottom: 25px;
    font-size: 16px;
  `;

  const input = document.createElement('input');
  input.type = 'password';
  input.placeholder = 'Enter password';
  input.id = 'password-input';
  input.style.cssText = `
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 16px;
    margin-bottom: 20px;
    transition: border-color 0.3s;
  `;

  const errorMsg = document.createElement('p');
  errorMsg.id = 'password-error';
  errorMsg.style.cssText = `
    color: #e74c3c;
    font-size: 14px;
    margin-bottom: 15px;
    min-height: 20px;
    display: none;
  `;

  const button = document.createElement('button');
  button.textContent = 'Enter';
  button.style.cssText = `
    width: 100%;
    padding: 12px 24px;
    background: #FF6B35;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.3s;
  `;

  // Add hover effect
  button.addEventListener('mouseenter', () => {
    button.style.background = '#E85A2B';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = '#FF6B35';
  });

  // Handle password submission
  const handleSubmit = () => {
    const password = input.value.trim();
    if (password === CORRECT_PASSWORD) {
      setAuthenticated();
      overlay.remove();
      // Show the main content
      document.body.style.display = '';
    } else {
      errorMsg.textContent = 'Incorrect password. Please try again.';
      errorMsg.style.display = 'block';
      input.value = '';
      input.focus();
    }
  };

  button.addEventListener('click', handleSubmit);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  });

  // Focus input on load
  setTimeout(() => input.focus(), 100);

  promptBox.appendChild(title);
  promptBox.appendChild(subtitle);
  promptBox.appendChild(input);
  promptBox.appendChild(errorMsg);
  promptBox.appendChild(button);
  overlay.appendChild(promptBox);
  
  // Append to documentElement instead of body so it's always visible
  document.documentElement.appendChild(overlay);

  // Hide main content initially
  document.body.style.display = 'none';
}

// Initialize password protection
function initAuth() {
  const isAuthenticated = checkAuthentication();
  console.log('Auth check:', isAuthenticated); // Debug log
  
  if (!isAuthenticated) {
    // Hide body content
    if (document.body) {
      document.body.style.display = 'none';
    }
    showPasswordPrompt();
  } else {
    // Already authenticated, ensure body is visible
    if (document.body) {
      document.body.style.display = '';
    }
  }
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  // DOM already loaded, run immediately
  initAuth();
}
