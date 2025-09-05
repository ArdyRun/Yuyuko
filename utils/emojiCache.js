const fs = require('fs');
const path = require('path');

const EMOJI_CACHE_FILE = path.join(__dirname, '..', 'emoji_cache.json');

/**
 * Save animated emojis to cache file
 * @param {Array} emojis - Array of emoji objects with id and name properties
 */
async function saveEmojiCache(emojis) {
    try {
        const cacheData = {
            emojis: emojis,
            lastUpdated: new Date().toISOString(),
            count: emojis.length
        };
        
        fs.writeFileSync(EMOJI_CACHE_FILE, JSON.stringify(cacheData, null, 2));
        console.log(`✅ Saved ${emojis.length} animated emojis to cache`);
    } catch (error) {
        console.error('Error saving emoji cache:', error.message);
    }
}

/**
 * Load animated emojis from cache file
 * @returns {Array|null} Array of emoji objects or null if error/not found
 */
async function loadEmojiCache() {
    try {
        if (!fs.existsSync(EMOJI_CACHE_FILE)) {
            return null;
        }
        
        const data = fs.readFileSync(EMOJI_CACHE_FILE, 'utf8');
        const cacheData = JSON.parse(data);
        return cacheData.emojis || [];
    } catch (error) {
        console.error('Error loading emoji cache:', error.message);
        return null;
    }
}

/**
 * Collect all animated emojis from all guilds
 * @param {Client} client - Discord client instance
 * @returns {Array} Array of emoji objects
 */
function collectAnimatedEmojis(client) {
    const animatedEmojis = [];
    
    client.guilds.cache.forEach(guild => {
        guild.emojis.cache.forEach(emoji => {
            if (emoji.animated) {
                animatedEmojis.push({
                    id: emoji.id,
                    name: emoji.name,
                    guildId: guild.id,
                    guildName: guild.name,
                    animated: true
                });
            }
        });
    });

    // Remove duplicates by ID
    const uniqueEmojis = Array.from(
        new Map(animatedEmojis.map(emoji => [emoji.id, emoji])).values()
    );
    
    return uniqueEmojis;
}

/**
 * Update emoji cache with current emojis from all guilds
 * @param {Client} client - Discord client instance
 */
async function updateEmojiCache(client) {
    try {
        const emojis = collectAnimatedEmojis(client);
        await saveEmojiCache(emojis);
        return emojis;
    } catch (error) {
        console.error('Error updating emoji cache:', error.message);
        return [];
    }
}

module.exports = {
    saveEmojiCache,
    loadEmojiCache,
    collectAnimatedEmojis,
    updateEmojiCache,
    EMOJI_CACHE_FILE
};
