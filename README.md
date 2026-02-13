# 🛡️ VerifyMe — One-Click Verification Bot

**VerifyMe** is a powerful Chrome Extension designed to help you bypass "Enter email to download" or "Verify to join" gates instantly. It eliminates the friction of disposable email services by automatically detecting verification links and putting them front-and-center.

## ✨ Features

- ⚡ **Instant Injection:** Automatically detects email fields on any website and adds a "🛡️ VERIFY" button inside the input.
- 🎯 **Focus Mode:** The extension popup only shows you what you need—the verification link or the OTP code. No inbox clutter.
- 📬 **Real-time Detection:** Background service worker polls for the first incoming email and surgically extracts the verification action.
- 📋 **Auto-Copy OTP:** If a verification code is found, it's automatically copied to your clipboard.
- 🏛️ **Security Navy Aesthetic:** A premium, high-contrast dark theme designed for focus and speed.

## 🚀 How to Install

1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked**.
4. Select the `VerifyMe-Extension` folder.

## 🛠️ How to Use

1. Navigate to any website asking for an email.
2. Look for the **🛡️ VERIFY** button inside the email input field.
3. Click it. It will generate a burner address and fill the field for you.
4. Submit the form on the website.
5. Click the **VerifyMe extension icon** in your toolbar.
6. As soon as the email arrives, a giant **"CLICK TO VERIFY"** button will appear (or your OTP code).
7. One click, and you're in.

## 🧪 Technical Details

- **Backend:** Powered by the [Mail.tm](https://mail.tm) API.
- **Engine:** Manifest V3 background service worker with smart HTML parsing for link extraction.
- **Frontend:** Vanilla JS + CSS for maximum performance and zero dependencies.

---

*Verified. Instant. Done.*