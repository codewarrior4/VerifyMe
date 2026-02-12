function updateUI() {
    chrome.storage.local.get(['identity', 'lastFound'], (data) => {
        const { identity, lastFound } = data;

        if (identity) {
            document.getElementById('current-address').textContent = identity.address;
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
        chrome.runtime.sendMessage({ type: 'GENERATE_ID' }, () => {
            updateUI();
        });
    }
}

document.getElementById('reset-btn').onclick = resetSession;
document.getElementById('found-reset-btn').onclick = resetSession;

document.getElementById('clear-result-btn').onclick = () => {
    chrome.storage.local.remove(['lastFound'], () => {
        chrome.runtime.sendMessage({ type: 'START_POLLING' });
        updateUI();
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

// Update every second while popup is open
updateUI();
const interval = setInterval(updateUI, 1000);

// Cleanup on close
window.onunload = () => clearInterval(interval);
