let modalOverlay = null;

function createModal() {
  if (modalOverlay) return;
  modalOverlay = document.createElement('div');
  modalOverlay.className = 'custom-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="custom-modal">
      <h3 class="custom-modal-title"></h3>
      <p class="custom-modal-message"></p>
      <div class="custom-modal-timer"></div>
      <div class="custom-modal-buttons"></div>
    </div>
  `;
  document.body.appendChild(modalOverlay);
}

function showModal({ title, message, countdown, buttons }) {
  createModal();
  if (modalOverlay._interval) clearInterval(modalOverlay._interval);
  if (modalOverlay._timeout) clearTimeout(modalOverlay._timeout);

  const titleEl = modalOverlay.querySelector('.custom-modal-title');
  const msgEl = modalOverlay.querySelector('.custom-modal-message');
  const timerEl = modalOverlay.querySelector('.custom-modal-timer');
  const btnsEl = modalOverlay.querySelector('.custom-modal-buttons');

  titleEl.textContent = title;
  msgEl.textContent = message;
  timerEl.textContent = typeof countdown === 'number' ? `Auto-close in ${countdown}s` : '';
  btnsEl.innerHTML = '';

  if (buttons) {
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.textContent = b.text;
      btn.onclick = () => { if (b.onClick) b.onClick(); hideModal(); };
      btnsEl.appendChild(btn);
    });
  }

  modalOverlay.style.display = 'flex';

  if (typeof countdown === 'number') {
    let left = countdown;
    timerEl.textContent = `Auto-close in ${left}s`;
    const iv = setInterval(() => {
      left--;
      timerEl.textContent = `Auto-close in ${left}s`;
    }, 1000);
    modalOverlay._interval = iv;

    const to = setTimeout(() => {
      clearInterval(iv);
      hideModal();
      if (buttons && buttons[0] && buttons[0].autoTimeoutCallback) buttons[0].autoTimeoutCallback();
    }, countdown * 1000);
    modalOverlay._timeout = to;
  }
}

export function hideModal() {
  if (!modalOverlay) return;
  modalOverlay.style.display = 'none';
  if (modalOverlay._interval) clearInterval(modalOverlay._interval);
  if (modalOverlay._timeout) clearTimeout(modalOverlay._timeout);
}

export function showConfirmationModal(message) {
  showModal({
    title: 'Info',
    message,
    buttons: [{ text: 'OK', onClick: () => hideModal() }]
  });
}

// ---- CSS ----
const style = document.createElement('style');
style.textContent = `
.custom-modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:2000;}
.custom-modal{background:white;padding:30px;border-radius:8px;width:300px;text-align:center;}
.custom-modal-title{margin-bottom:5px;}
.custom-modal-message{padding:20px 0;}
.custom-modal-buttons button{padding:8px 16px;border:none;border-radius:9999px;background:#d00024;color:white;cursor:pointer;transition:background .3s;}
.custom-modal-buttons button:hover{background:#b0001d;}
.custom-modal-timer{margin:10px;font-size:small;font-weight:400;}
`;
document.head.appendChild(style);
