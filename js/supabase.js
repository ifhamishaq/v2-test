// =============================================
// SUPABASE CLIENT CONFIGURATION
// =============================================

// Import Supabase client from CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Initialize Supabase client
const SUPABASE_URL = 'https://zgbfhvqjehhxcutvrvfo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnYmZodnFqZWhoeGN1dHZydmZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDEzNTMsImV4cCI6MjA4NDE3NzM1M30.5c3STu_DwrBF8qzAwm_alO_6bZIF7_i3n9LF3R6N6hY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =============================================
// AUTHENTICATION HELPERS
// =============================================

// Sign up with email and password
export async function signUp(email, password, username) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username  // Stored in user metadata
                }
            }
        });

        if (error) throw error;

        // Database trigger will automatically create the profile!
        return { data, error: null };
    } catch (error) {
        console.error('Signup error:', error);
        return { data: null, error };
    }
}

// Sign in with email and password
export async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Login error:', error);
        return { data: null, error };
    }
}

// Sign in with Google OAuth
export async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    });
    return { data, error };
}

// Sign in with GitHub OAuth
export async function signInWithGitHub() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
            redirectTo: window.location.origin
        }
    });
    return { data, error };
}

// Sign out
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
        window.location.reload();
    }
    return { error };
}

// Get current user
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// Get current session
export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// =============================================
// WALLPAPER OPERATIONS
// =============================================

// Upload wallpaper to community
export async function uploadWallpaper(imageBlob, metadata) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        // 1. Upload image to storage
        const fileName = `${user.id}/${Date.now()}_${metadata.title.replace(/\s+/g, '_')}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('wallpapers')
            .upload(fileName, imageBlob, {
                contentType: 'image/png',
                cacheControl: '3600'
            });

        if (uploadError) throw uploadError;

        // 2. Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('wallpapers')
            .getPublicUrl(fileName);

        // 3. Create thumbnail (simplified - you might want to resize on server)
        const thumbnailUrl = publicUrl; // TODO: Generate actual thumbnail

        // 4. Insert into database
        const { data, error } = await supabase
            .from('wallpapers')
            .insert({
                user_id: user.id,
                title: metadata.title,
                description: metadata.description || '',
                image_url: publicUrl,
                thumbnail_url: thumbnailUrl,
                genre: metadata.genre,
                style: metadata.style,
                prompt: metadata.prompt,
                seed: metadata.seed,
                width: metadata.width || 1920,
                height: metadata.height || 1080,
                is_public: metadata.isPublic !== false
            })
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Upload error:', error);
        return { data: null, error };
    }
}

// Fetch community wallpapers
export async function fetchWallpapers(options = {}) {
    const {
        page = 0,
        limit = 20,
        orderBy = 'created_at',
        ascending = false,
        userId = null
    } = options;

    let query = supabase
        .from('wallpapers')
        .select(`
            *,
            profiles (
                username,
                display_name,
                avatar_url
            )
        `)
        .eq('is_public', true)
        .order(orderBy, { ascending })
        .range(page * limit, (page + 1) * limit - 1);

    if (userId) {
        query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    return { data, error };
}

// Like/unlike wallpaper
export async function toggleLike(wallpaperId) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        // Check if already liked
        const { data: existingLike } = await supabase
            .from('likes')
            .select('id')
            .eq('user_id', user.id)
            .eq('wallpaper_id', wallpaperId)
            .single();

        if (existingLike) {
            // Unlike
            const { error } = await supabase
                .from('likes')
                .delete()
                .eq('id', existingLike.id);
            return { liked: false, error };
        } else {
            // Like
            const { error } = await supabase
                .from('likes')
                .insert({
                    user_id: user.id,
                    wallpaper_id: wallpaperId
                });
            return { liked: true, error };
        }
    } catch (error) {
        console.error('Toggle like error:', error);
        return { liked: false, error };
    }
}

// Save/unsave wallpaper to collection
export async function toggleSave(wallpaperId) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        // Check if already saved
        const { data: existingSave } = await supabase
            .from('saves')
            .select('id')
            .eq('user_id', user.id)
            .eq('wallpaper_id', wallpaperId)
            .single();

        if (existingSave) {
            // Unsave
            const { error } = await supabase
                .from('saves')
                .delete()
                .eq('id', existingSave.id);
            return { saved: false, error };
        } else {
            // Save
            const { error } = await supabase
                .from('saves')
                .insert({
                    user_id: user.id,
                    wallpaper_id: wallpaperId
                });
            return { saved: true, error };
        }
    } catch (error) {
        console.error('Toggle save error:', error);
        return { saved: false, error };
    }
}

// Add comment
export async function addComment(wallpaperId, content) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('comments')
            .insert({
                user_id: user.id,
                wallpaper_id: wallpaperId,
                content: content
            })
            .select(`
                *,
                profiles (
                    username,
                    display_name,
                    avatar_url
                )
            `)
            .single();

        return { data, error };
    } catch (error) {
        console.error('Comment error:', error);
        return { data: null, error };
    }
}

// Fetch comments for a wallpaper
export async function fetchComments(wallpaperId) {
    const { data, error } = await supabase
        .from('comments')
        .select(`
            *,
            profiles (
                username,
                display_name,
                avatar_url
            )
        `)
        .eq('wallpaper_id', wallpaperId)
        .order('created_at', { ascending: true });

    return { data, error };
}

// =============================================
// REALTIME SUBSCRIPTIONS
// =============================================

// Subscribe to new wallpapers
export function subscribeToWallpapers(callback) {
    const channel = supabase
        .channel('wallpapers-channel')
        .on('postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'wallpapers',
                filter: 'is_public=eq.true'
            },
            (payload) => {
                callback(payload.new);
            }
        )
        .subscribe();

    return channel;
}

// Unsubscribe from channel
export function unsubscribe(channel) {
    supabase.removeChannel(channel);
}

// =============================================
// AUTH STATE LISTENER
// =============================================

// Listen to auth state changes
export function onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });

    return subscription;
}
