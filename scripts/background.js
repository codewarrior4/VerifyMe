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
        const res = await fetch(`${API_BASE}/messages`, {
            headers: { Authorization: `Bearer ${identity.token}` }
        });
        const data = await res.json();
        const messages = data['hydra:member'];

        if (messages.length > 0) {
            const latestMsg = messages[0];
            // Fetch full content
            const msgRes = await fetch(`${API_BASE}/messages/${latestMsg.id}`, {
                headers: { Authorization: `Bearer ${identity.token}` }
            });
            const fullMsg = await msgRes.json();

            const verificationInfo = parseEmailForAction(fullMsg.html || fullMsg.text);

            if (verificationInfo) {
                chrome.storage.local.set({
                    lastFound: {
                        ...verificationInfo,
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

function parseEmailForAction(html) {
    if (!html) return null;

    // 1. Check for OTP (4-8 digit numbers)
    const otpMatch = html.match(/\b\d{4,8}\b/);
    if (otpMatch) {
        return { type: 'OTP', value: otpMatch[0] };
    }

    // 2. Check for Verification Links
    const linkRegex = /href="([^"]*(?:confirm|verify|activate|validate|click|signup|token)[^"]*)"/gi;
    let match;
    const links = [];
    while ((match = linkRegex.exec(html)) !== null) {
        links.push(match[1]);
    }

    if (links.length > 0) {
        // Return the shortest link that looks most like a verification token
        const bestLink = links.sort((a, b) => a.length - b.length)[0];
        return { type: 'LINK', value: bestLink };
    }

    return null;
}
