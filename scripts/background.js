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
    // 1. Get clean text content (strip HTML to avoid matching meta numbers)
    let cleanContent = text || '';
    if (html && !cleanContent) {
        cleanContent = html.replace(/<[^>]*>?/gm, ' ');
    }

    const content = cleanContent.toLowerCase();
    if (!content) return null;

    // 2. High Priority: Look for exactly 6 digits (most common)
    const sixDigitMatch = content.match(/\b\d{6}\b/);
    if (sixDigitMatch) {
        return { type: 'OTP', value: sixDigitMatch[0] };
    }

    // 3. Medium Priority: Look for 4-8 digits near keywords
    const otpKeywords = /(?:otp|code|verification|passcode|confirm|reset|password|onely)[:\s]+(\d{4,8})/i;
    const keywordMatch = content.match(otpKeywords);
    if (keywordMatch) {
        return { type: 'OTP', value: keywordMatch[1] };
    }

    // 4. Fallback: Any standalone 4-8 digit number
    const standaloneMatch = content.match(/\b\d{4,8}\b/);
    if (standaloneMatch) {
        return { type: 'OTP', value: standaloneMatch[0] };
    }

    // 5. Advanced Link Detection
    // We search for <a> tags specifically and check both the HREF and the INNER TEXT
    const aTagRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const candidates = [];

    const verifKeywords = ['confirm', 'verify', 'activate', 'validate', 'token', 'reset', 'password', 'click', 'start', 'login', 'sign', 'onely'];
    const ignoreKeywords = ['unsubscribe', 'privacy', 'terms', 'opt-out', 'preferences', 'help', 'support', 'about', 'blog', 'twitter', 'facebook', 'instagram'];

    const searchSpace = (html || '') + " " + content;

    while ((match = aTagRegex.exec(html || '')) !== null) {
        const url = match[1];
        const text = match[2].replace(/<[^>]*>?/gm, ' ').toLowerCase(); // Strip inner HTML tags from text
        const urlLower = url.toLowerCase();

        // Skip links that look like noise
        if (ignoreKeywords.some(k => urlLower.includes(k) || text.includes(k))) continue;

        let score = 0;
        // Priority for verification keywords in URL or TEXT
        verifKeywords.forEach(k => {
            if (urlLower.includes(k)) score += 10;
            if (text.includes(k)) score += 15;
        });

        if (score > 0) {
            candidates.push({ url, score, textLen: text.length });
        }
    }

    if (candidates.length > 0) {
        // Sort by score (desc) then by text length (asc)
        const best = candidates.sort((a, b) => (b.score - a.score) || (a.textLen - b.textLen))[0];
        return { type: 'LINK', value: best.url };
    }

    // Fallback: If no <a> tags found, try plain text URLs as before
    const plainUrlRegex = /(https?:\/\/[^\s"'<>]+(?:confirm|verify|activate|validate|token|reset|password|onely)[^\s"'<>]*)/gi;
    const plainLinks = searchSpace.match(plainUrlRegex) || [];
    if (plainLinks.length > 0) {
        const bestLink = plainLinks.sort((a, b) => a.length - b.length)[0];
        return { type: 'LINK', value: bestLink };
    }

    return null;
}
