const { Client, Collection, GatewayIntentBits, REST, Routes } = require("discord.js");
const { DISCORD_TOKEN, CLIENT_ID } = require("./environment");
const fs = require("fs");
const path = require("path");
const handleAyumiCommand = require('./commands/geminiReply'); // Updated import name
const logCommand = require('./commands/log.js');
const { checkRank, trackUserQuizStart } = require("./ranked/checkRank");
const { updateEmojiCache } = require('./utils/emojiCache');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath, { recursive: true });

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const validCommands = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        if (command?.data?.name && command?.execute) {
            client.commands.set(command.data.name, command);
            validCommands.push(command);
        }
    } catch (error) {
        console.error(`Error loading command ${file}:`, error.message);
    }
}

async function deployCommandsToAllGuilds() {
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
    const commands = validCommands.map(cmd => cmd.data.toJSON());
    if (!commands.length) return;

    const guilds = client.guilds.cache;
    for (const [guildId, guild] of guilds) {
        try {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
            console.log(`✅ ${guild.name} (${guildId})`);
        } catch (err) {
            console.error(`${guild.name} (${guildId}) -> ERROR:`, err.message);
        }
    }
}

client.once("ready", async () => {
    console.log(`${client.user.tag} is now online`);
    await deployCommandsToAllGuilds();
    
    // Update emoji cache when bot starts
    console.log('🔄 Updating emoji cache...');
    await updateEmojiCache(client);
    console.log('✅ Emoji cache updated');
});

// Update emoji cache when bot joins a new guild
client.on("guildCreate", async (guild) => {
    console.log(`🆕 Bot joined new guild: ${guild.name} (${guild.id})`);
    console.log('🔄 Updating emoji cache due to new guild...');
    await updateEmojiCache(client);
    console.log('✅ Emoji cache updated');
});

// Update emoji cache when emojis are updated in a guild
client.on("emojiUpdate", async () => {
    console.log('🔄 Updating emoji cache due to emoji changes...');
    await updateEmojiCache(client);
    console.log('✅ Emoji cache updated');
});

// Update emoji cache when bot leaves a guild
client.on("guildDelete", async (guild) => {
    console.log(`❌ Bot left guild: ${guild.name} (${guild.id})`);
    console.log('🔄 Updating emoji cache due to guild removal...');
    await updateEmojiCache(client);
    console.log('✅ Emoji cache updated');
});

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isButton()) return await logCommand.handleButton(interaction);

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        if (interaction.isAutocomplete() && command.autocomplete) {
            return await command.autocomplete(interaction);
        }

        if (interaction.isChatInputCommand()) {
            await command.execute(interaction);
        }
    } catch (error) {
        console.error('Error in interaction:', error.message);
        const reply = {
            content: 'Terjadi error saat menjalankan perintah.',
            ephemeral: true
        };
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        } catch (err) {
            console.error('Error replying to interaction:', err.message);
        }
    }
});

client.on("messageCreate", async (message) => {
    try {
        // Check for a!ayumi command (case insensitive)
        if (message.content.toLowerCase().startsWith('a!ayumi')) {
            await handleAyumiCommand(message);
            return;
        }
        
        // Other existing handlers
        if (message.content.startsWith("k!quiz")) trackUserQuizStart(message);
        if (message.author.id === "251239170058616833") await checkRank(message);
    } catch (error) {
        console.error('Error in messageCreate:', error.message);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

client.login(DISCORD_TOKEN).catch(error => {
    console.error('Login failed:', error.message);
    process.exit(1);
});
