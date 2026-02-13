// Find email fields
function injectButtons() {
    const emailInputs = document.querySelectorAll('input[type="email"], input[name*="email"], input[id*="email"]');

    emailInputs.forEach(input => {
        if (input.dataset.verifyme) return; // Prevent double injection
        input.dataset.verifyme = "true";

        // Create wrapper to hold the button
        const container = document.createElement('div');
        container.className = 'verifyme-container';
        input.parentNode.insertBefore(container, input);
        container.appendChild(input);

        const btn = document.createElement('button');
        btn.className = 'verifyme-btn';
        btn.innerHTML = `🛡️ VERIFY`;
        btn.title = 'Use VerifyMe to bypass this gate';

        btn.onclick = (e) => {
            e.preventDefault();
            btn.innerHTML = '⌛...';
            btn.disabled = true;

            chrome.runtime.sendMessage({ type: 'GENERATE_ID' }, (response) => {
                if (response && response.success) {
                    input.value = response.address;
                    // Trigger input events for frameworks like React/Vue
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    btn.innerHTML = '✅ DONE';

                    // Tell background to start watching
                    chrome.runtime.sendMessage({ type: 'START_POLLING' });
                } else {
                    btn.innerHTML = '❌ FAIL';
                }
            });
        };

        container.appendChild(btn);
    });
}

// Listen for verification codes from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CODE_FOUND' && request.data.type === 'OTP') {
        showFloatingBadge(request.data.value, request.data.sender);
    }
});

function showFloatingBadge(code, sender) {
    const activeEmailInput = document.querySelector('input[data-verifyme="true"]');
    if (!activeEmailInput) return;

    // Remove existing badges
    const existing = document.getElementById('verifyme-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'verifyme-badge';
    badge.className = 'verifyme-floating-badge';
    badge.innerHTML = `
        <div style="font-size: 10px; opacity: 0.8; margin-bottom: 4px;">Found for ${sender}</div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 900; color: #3b82f6; font-size: 16px;">${code}</span>
            <button id="paste-otp-btn" style="background: #3b82f6; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold;">PASTE</button>
        </div>
        <button id="close-verifyme-badge" style="position: absolute; top: 4px; right: 4px; background: none; border: none; color: white; cursor: pointer; font-size: 8px;">✕</button>
    `;

    document.body.appendChild(badge);

    // Position near the input
    const rect = activeEmailInput.getBoundingClientRect();
    badge.style.top = (window.scrollY + rect.bottom + 10) + 'px';
    badge.style.left = (window.scrollX + rect.left) + 'px';

    document.getElementById('paste-otp-btn').onclick = () => {
        // Try to find the OTP input on the page
        const otpInput = document.querySelector('input[name*="otp"], input[name*="code"], input[id*="otp"], input[id*="code"], input[placeholder*="code"], input[maxlength="6"]');
        if (otpInput) {
            otpInput.value = code;
            otpInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // If no specific OTP input found, copy to clipboard
            navigator.clipboard.writeText(code);
            document.getElementById('paste-otp-btn').innerText = 'COPIED!';
        }
    };

    document.getElementById('close-verifyme-badge').onclick = () => badge.remove();
}

// Add Styles
const styles = document.createElement('style');
styles.textContent = `
    .verifyme-container { position: relative; display: inline-block; width: 100%; }
    .verifyme-btn {
        position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        background: #3b82f6; color: white; border: none; padding: 4px 8px;
        border-radius: 6px; font-size: 10px; font-weight: 900; cursor: pointer;
        z-index: 10; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    .verifyme-btn:hover { background: #2563eb; }
    .verifyme-floating-badge {
        position: absolute; background: #161618; color: white; padding: 12px;
        border-radius: 12px; z-index: 2147483647; font-family: system-ui, sans-serif;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid rgba(59, 130, 246, 0.4);
        animation: badge-fade-in 0.3s ease-out; width: auto; min-width: 140px;
    }
    @keyframes badge-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
`;
document.head.appendChild(styles);

// Initial run and watch for DOM changes
injectButtons();
const observer = new MutationObserver(injectButtons);
observer.observe(document.body, { childList: true, subtree: true });
