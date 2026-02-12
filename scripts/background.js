const API_BASE = 'https://api.mail.tm';
let pollingInterval = null;

// Storage Helper
const setIdentity = (data) => chrome.storage.local.set({ identity: data });
const getIdentity = () => chrome.storage.local.get(['identity']).then(res => res.identity);

// Listen for messages from Content Script or Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GENERATE_ID') {
        handleCreateAccount().then(sendResponse);
        return true;
    }
    if (request.type === 'START_POLLING') {
        startPolling();
        sendResponse({ status: 'started' });
    }
});

async function handleCreateAccount() {
    try {
        const domainRes = await fetch(`${API_BASE}/domains`);
        const domains = await domainRes.json();
        const domain = domains['hydra:member'][0].domain;

        const address = `${Math.random().toString(36).substring(2, 12)}@${domain}`;
        const password = Math.random().toString(36).substring(2, 12);

        const accRes = await fetch(`${API_BASE}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });
        const account = await accRes.json();

        const tokenRes = await fetch(`${API_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });
        const tokenData = await tokenRes.json();

        const identity = {
            id: account.id,
            address,
            password, // Store password to allow deep-linking to BurnerX
            token: tokenData.token,
            createdAt: new Date().toISOString()
        };

        await setIdentity(identity);
        // Clear previous results when generating a new identity
        await chrome.storage.local.remove(['lastFound']);
        return { success: true, address };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    checkForVerification(); // Run once immediately
    pollingInterval = setInterval(checkForVerification, 5000);
}

async function checkForVerification() {
    const identity = await getIdentity();
    if (!identity) return;

    try {
        const storage = await chrome.storage.local.get(['ignoredId']);
        const ignoredId = storage.ignoredId;

        const res = await fetch(`${API_BASE}/messages`, {
            headers: { Authorization: `Bearer ${identity.token}` }
        });
        const data = await res.json();
        const messages = data['hydra:member'];

        if (messages.length > 0) {
            const latestMsg = messages[0];

            // Skip if this message has been dismissed
            if (latestMsg.id === ignoredId) return;

            // Fetch full content
            const msgRes = await fetch(`${API_BASE}/messages/${latestMsg.id}`, {
                headers: { Authorization: `Bearer ${identity.token}` }
            });
            const fullMsg = await msgRes.json();

            const verificationInfo = parseEmailForAction(fullMsg.html, fullMsg.text);

            if (verificationInfo) {
                chrome.storage.local.set({
                    lastFound: {
                        ...verificationInfo,
                        id: latestMsg.id,
                        subject: latestMsg.subject,
                        time: new Date().toISOString()
                    }
                });

                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: '../icons/icon128.png',
                    title: 'Verification Found!',
                    message: verificationInfo.type === 'OTP'
                        ? `Your code is ${verificationInfo.value}`
                        : 'Click the button in VerifyMe to complete.',
                    priority: 2
                });

                clearInterval(pollingInterval);
            }
        }
    } catch (err) {
        console.error('Polling error:', err);
    }
}

function parseEmailForAction(html, text) {
    const cleanContent = (text || '') + (html ? html.replace(/<[^>]*>?/gm, ' ') : '');
    const content = cleanContent.toLowerCase();
    if (!content.trim()) return null;

    // 1. OTP DETECTION (Prioritize 6-digit)
    const sixDigitMatch = content.match(/\b\d{6}\b/);
    if (sixDigitMatch) return { type: 'OTP', value: sixDigitMatch[0] };

    const otpKeywords = /(?:otp|code|verification|passcode|confirm|reset|password|recovery)[:\s]+(\d{4,8})/i;
    const keywordMatch = content.match(otpKeywords);
    if (keywordMatch) return { type: 'OTP', value: keywordMatch[1] };

    const standaloneMatch = content.match(/\b\d{4,8}\b/);
    if (standaloneMatch) return { type: 'OTP', value: standaloneMatch[0] };

    // 2. LINK DETECTION
    const verifKeywords = ['confirm', 'verify', 'activate', 'validate', 'token', 'reset', 'password', 'recovery', 'auth', 'login', 'click'];
    const ignoreKeywords = ['unsubscribe', 'privacy', 'terms', 'opt-out', 'preferences', 'help', 'support', 'about'];

    // Extract all potential URLs
    const urlRegex = /https?:\/\/[^\s"'<>#]+(?:[?#][^\s"'<>]*)?/gi;
    const allUrls = (html + " " + content).match(urlRegex) || [];

    const candidates = [];
    allUrls.forEach(url => {
        const urlLower = url.toLowerCase();
        if (ignoreKeywords.some(k => urlLower.includes(k))) return;

        let score = 0;
        // Search for keywords in the URL string itself
        verifKeywords.forEach(k => {
            if (urlLower.includes(k)) score += 10;
        });

        // Search for keywords in the text *around* where this URL appeared in content
        // This is a rough check
        if (score > 0 || verifKeywords.some(k => content.includes(k))) {
            candidates.push({ url, score });
        }
    });

    if (candidates.length > 0) {
        // Sort by score then length (usually shorter is the actual action link)
        const best = candidates.sort((a, b) => b.score - a.score || a.url.length - b.url.length)[0];
        return { type: 'LINK', value: best.url };
    }

    return null;
}
