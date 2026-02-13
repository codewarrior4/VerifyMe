const API_BASE = 'https://api.mail.tm';

function updateUI() {
    chrome.storage.local.get(['identity', 'lastFound'], (data) => {
        const { identity, lastFound } = data;

        if (identity) {
            document.getElementById('current-address').textContent = identity.address;
            // Pass address, password, AND account ID to BurnerX
            const syncToken = btoa(`${identity.address}:${identity.password}:${identity.id}`);
            const burnUrl = `https://codewarrior4.github.io/BurnerX/?sync=${syncToken}`;
            document.getElementById('full-inbox-link').href = burnUrl;
        }

        if (lastFound) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('found').style.display = 'block';

            if (lastFound.type === 'OTP') {
                document.getElementById('otp-section').style.display = 'block';
                document.getElementById('link-section').style.display = 'none';
                document.getElementById('otp-code').textContent = lastFound.value;
                // Auto copy OTP
                navigator.clipboard.writeText(lastFound.value);
            } else {
                document.getElementById('otp-section').style.display = 'none';
                document.getElementById('link-section').style.display = 'block';
                document.getElementById('verify-link').href = lastFound.value;
            }
        } else {
            document.getElementById('loading').style.display = 'block';
            document.getElementById('found').style.display = 'none';
        }
    });
}

function resetSession() {
    if (confirm('Start a new session? This will generate a new email address.')) {
        chrome.storage.local.remove(['ignoredId'], () => {
            chrome.runtime.sendMessage({ type: 'GENERATE_ID' }, () => {
                updateUI();
            });
        });
    }
}

document.getElementById('reset-btn').onclick = resetSession;
document.getElementById('found-reset-btn').onclick = resetSession;

document.getElementById('clear-result-btn').onclick = () => {
    chrome.storage.local.get(['lastFound'], (data) => {
        const idToIgnore = data.lastFound?.id;
        chrome.storage.local.set({ ignoredId: idToIgnore }, () => {
            chrome.storage.local.remove(['lastFound'], () => {
                chrome.runtime.sendMessage({ type: 'START_POLLING' });
                updateUI();
            });
        });
    });
};

document.getElementById('refresh-btn').onclick = () => {
    const btn = document.getElementById('refresh-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '🔄 CHECKING...';
    btn.disabled = true;

    chrome.runtime.sendMessage({ type: 'START_POLLING' }, () => {
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            updateUI();
        }, 1000);
    });
};

document.getElementById('copy-addr').onclick = () => {
    const addr = document.getElementById('current-address').textContent;
    navigator.clipboard.writeText(addr);
    const btn = document.getElementById('copy-addr');
    const original = btn.textContent;
    btn.textContent = '✅';
    setTimeout(() => btn.textContent = original, 2000);
};

// --- MINI INBOX LOGIC ---
document.getElementById('toggle-inbox').onclick = () => {
    const list = document.getElementById('inbox-list');
    const btn = document.getElementById('toggle-inbox');
    if (list.style.display === 'block') {
        list.style.display = 'none';
        btn.textContent = '📂 VIEW MINI INBOX';
    } else {
        list.style.display = 'block';
        btn.textContent = '✕ HIDE INBOX';
        loadInbox();
    }
};

async function loadInbox() {
    const data = await chrome.storage.local.get(['identity']);
    if (!data.identity) return;

    const list = document.getElementById('inbox-list');
    list.innerHTML = '<p style="font-size: 10px; color: var(--dim); text-align: center;">Loading messages...</p>';

    try {
        const res = await fetch(`${API_BASE}/messages`, {
            headers: { Authorization: `Bearer ${data.identity.token}` }
        });
        const msgData = await res.json();
        const messages = msgData['hydra:member'];

        if (messages.length === 0) {
            list.innerHTML = '<p style="font-size: 10px; color: var(--dim); text-align: center;">No messages yet.</p>';
            return;
        }

        list.innerHTML = '';
        messages.forEach(msg => {
            const item = document.createElement('div');
            item.className = 'inbox-item';
            item.innerHTML = `
                <div class="subject">${msg.subject || '(No Subject)'}</div>
                <div class="from">${msg.from.address}</div>
            `;
            item.onclick = () => viewMessage(msg.id, data.identity.token);
            list.appendChild(item);
        });
    } catch (err) {
        list.innerHTML = '<p style="font-size: 10px; color: #ff5252; text-align: center;">Failed to load inbox.</p>';
    }
}

async function viewMessage(id, token) {
    const detail = document.getElementById('message-detail');
    const body = document.getElementById('msg-body');
    const subject = document.getElementById('msg-subject');
    const from = document.getElementById('msg-from');

    detail.style.display = 'block';
    body.innerHTML = '<p style="text-align: center; margin-top: 50px;">Opening email...</p>';

    try {
        const res = await fetch(`${API_BASE}/messages/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const msg = await res.json();

        subject.textContent = msg.subject || '(No Subject)';
        from.textContent = msg.from.address;

        if (msg.html && (Array.isArray(msg.html) ? msg.html.length > 0 : msg.html.length > 0)) {
            // Use iframe for HTML content to prevent CSS leaking
            const iframe = document.createElement('iframe');
            body.innerHTML = '';
            body.appendChild(iframe);
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(Array.isArray(msg.html) ? msg.html[0] : msg.html);
            doc.close();

            // Adjust iframe height
            iframe.onload = () => {
                iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 50) + 'px';
            };
        } else {
            body.innerHTML = `<pre style="white-space: pre-wrap; font-family: sans-serif; font-size: 13px; background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">${msg.text || 'No content'}</pre>`;
        }
    } catch (err) {
        body.innerHTML = '<p style="color: #ff5252;">Failed to load message content.</p>';
    }
}

document.getElementById('close-msg').onclick = () => {
    document.getElementById('message-detail').style.display = 'none';
};

// Update every second while popup is open
updateUI();
const interval = setInterval(updateUI, 1000);

// Cleanup on close
window.onunload = () => clearInterval(interval);
