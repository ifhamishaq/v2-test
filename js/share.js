// =============================================
// SHARE TO COMMUNITY HANDLERS
// =============================================

import { uploadWallpaper, getCurrentUser, supabase } from './supabase-client.js';

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
        alert('Please sign in to share wallpapers');
        return;
    }

    // Check if we have wallpaper data
    if (!window.currentWallpaperData) {
        console.error('No wallpaper data found');
        alert('No wallpaper to share. Please generate a wallpaper first.');
        return;
    }

    console.log('Wallpaper data:', window.currentWallpaperData);

    // Prompt for title and description
    const title = prompt('Give your wallpaper a title:', `${window.currentWallpaperData.genre} ${window.currentWallpaperData.style}`);
    if (!title) return; // User cancelled

    const description = prompt('Add a description (optional):', '');

    console.log('Uploading to community...');

    try {
        // Don't re-upload the image - just save metadata with existing URL
        // The image is already publicly accessible on R2
        const user = await getCurrentUser();
        console.log('Current user:', user);

        // Check if profile exists, create if not
        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .single();

        if (!existingProfile) {
            console.log('Profile not found, creating...');
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
                alert('Please refresh the page and try again. Your profile needs to be set up.');
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
                thumbnail_url: window.currentWallpaperData.imageUrl, // Use same URL
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

        if (error) {
            console.error('Database error:', error);
            throw error;
        }

        console.log('Shared successfully:', data);

        // Success!
        alert('✨ Shared to community successfully!');

        // Ask if they want to view it
        if (confirm('Wallpaper shared! View in community gallery?')) {
            window.location.href = 'community.html';
        }

    } catch (error) {
        console.error('Share error:', error);
        alert(`Failed to share: ${error.message}`);
    }
};
