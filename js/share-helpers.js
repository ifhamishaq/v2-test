// ============================================================================
// SHARE TO COMMUNITY HELPERS
// ============================================================================
window.shareHistoryItem = function (item) {
    console.log('shareHistoryItem called with:', item);

    // Set the current wallpaper data from history
    window.currentWallpaperData = {
        imageUrl: item.url,
        genre: item.genre || 'Unknown',
        style: item.style || 'Unknown',
        prompt: item.prompt || '',
        seed: item.seed || null,
        width: item.width || 1920,
        height: item.height || 1080
    };

    console.log('Set currentWallpaperData:', window.currentWallpaperData);

    // Call the share function
    if (typeof shareToCommunity === 'function') {
        shareToCommunity();
    } else {
        console.error('shareToCommunity function not found. Make sure share.js is loaded.');
        alert('Share feature not available. Please refresh the page.');
    }
};
