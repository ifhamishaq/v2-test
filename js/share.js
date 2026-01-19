// =============================================
// SHARE TO COMMUNITY HANDLERS
// =============================================

import { uploadWallpaper, getCurrentUser, supabase } from './supabase.js';
import { showToast } from './toast.js';

// Global variable to track current wallpaper
window.currentWallpaperData = null;

// Share current wallpaper to community
window.shareToCommunity = async function () {
    console.log('shareToCommunity called');
    const user = await getCurrentUser();

    // Check if user is logged in
    if (!user) {
        console.log('User not logged in');
        if (typeof openAuthModal === 'function') {
            openAuthModal();
        }
        showToast('Please sign in to share your masterpiece', 'warning');
        return;
    }

    // Check if we have wallpaper data
    if (!window.currentWallpaperData) {
        console.error('No wallpaper data found');
        showToast('No wallpaper to share. Create one first!', 'warning');
        return;
    }

    console.log('Wallpaper data:', window.currentWallpaperData);

    // Prompt for title and description
    // Using custom styling or just keeping prompt for simplicity, 
    // but the user asked for "masterpiece" so maybe I should use a custom modal?
    // For now, I'll stick to logic fix first as this might be the "first error".
    const title = prompt('Give your masterpiece a title:', `${window.currentWallpaperData.genre} ${window.currentWallpaperData.style}`);
    if (!title) return;

    const description = prompt('Add a story or description (optional):', '');

    showToast('Publishing to community gallery...', 'info', 2000);

    try {
        const user = await getCurrentUser();

        // Profile setup check
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .single();

        if (!existingProfile) {
            const username = user.email.split('@')[0];
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: user.id,
                    username: username,
                    display_name: username
                });

            if (profileError) {
                console.error('Profile creation error:', profileError);
                showToast('Profile setup failed. Please try again.', 'error');
                return;
            }
        }

        const { data, error } = await supabase
            .from('wallpapers')
            .insert({
                user_id: user.id,
                title: title,
                description: description || '',
                image_url: window.currentWallpaperData.imageUrl,
                thumbnail_url: window.currentWallpaperData.imageUrl,
                genre: window.currentWallpaperData.genre,
                style: window.currentWallpaperData.style,
                prompt: window.currentWallpaperData.prompt,
                seed: window.currentWallpaperData.seed,
                width: window.currentWallpaperData.width,
                height: window.currentWallpaperData.height,
                is_public: true
            })
            .select()
            .single();

        if (error) throw error;

        showToast('✨ Published to Community Successfully!', 'success', 5000);

        // Optional confirmation to view
        setTimeout(() => {
            if (confirm('Wallpaper shared! View in community gallery?')) {
                window.location.href = 'community.html';
            }
        }, 1000);

    } catch (error) {
        console.error('Share error:', error);
        showToast(`Failed to publish: ${error.message}`, 'error');
    }
};
