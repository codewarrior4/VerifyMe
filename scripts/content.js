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

// Initial run and watch for DOM changes
injectButtons();
const observer = new MutationObserver(injectButtons);
observer.observe(document.body, { childList: true, subtree: true });
