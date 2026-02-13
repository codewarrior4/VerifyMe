chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'PLAY_SOUND') {
        const audio = new Audio(message.url);
        audio.volume = 0.5;
        audio.play();
    }
});
