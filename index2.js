const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes 
} = require('discord.js');
const express = require('express');

// --- 1. MINIMAL WEB SERVER FOR RENDER FREE TIER ---
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.send('Bot is active and running on Render!');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

// --- 2. CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers // Required to check account info and add roles
    ]
});

// --- 3. SLASH COMMAND SETUP ---
const commands = [
    {
        name: 'verify_channel',
        description: 'Posts the verification prompt UI.'
    }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // Register slash commands
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// --- 4. INTERACTION HANDLING (COMMANDS & BUTTONS) ---
client.on('interactionCreate', async (interaction) => {
    // Handle Slash Command
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'verify_channel') {
            // Check if user is administrator
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: '❌ You must be an administrator to use this command.', ephemeral: true });
            }

            // Create embed to perfectly match your UI layout
            const embed = new EmbedBuilder()
                .setTitle('Verification')
                .setDescription('Press Verify Now to unlock the rest of the channels.')
                .setColor(0x2f3136); // Blends natively into the Discord UI box

            // Create button matching layout
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_btn')
                    .setLabel('Verify Now')
                    .setStyle(ButtonStyle.Primary) // Primary = Blurple
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    // Handle Button Clicks
    if (interaction.isButton()) {
        if (interaction.customId === 'verify_btn') {
            const member = interaction.member;
            const user = interaction.user;

            // Check 1: Account Age (e.g., must be older than 7 days)
            const minAgeDays = 7;
            const now = Date.now();
            const accountCreated = user.createdTimestamp;
            const accountAgeDays = (now - accountCreated) / (1000 * 60 * 60 * 24);

            if (accountAgeDays < minAgeDays) {
                return interaction.reply({
                    content: `❌ Verification failed. Your account must be at least ${minAgeDays} days old.`,
                    ephemeral: true
                });
            }

            // Check 2: Username anti-bot filters
            const username = user.username.toLowerCase();
            const suspiciousKeywords = ['bot_', 'testbot', 'spam'];
            const isSuspicious = suspiciousKeywords.some(keyword => username.includes(keyword));

            if (isSuspicious) {
                return interaction.reply({
                    content: '❌ Verification failed. Your username triggered our automated anti-bot filters.',
                    ephemeral: true
                });
            }

            // Check 3: Assign Role
            const role = interaction.guild.roles.cache.get(VERIFIED_ROLE_ID);
            if (!role) {
                return interaction.reply({ content: '❌ Error: Verified role not found.', ephemeral: true });
            }

            try {
                await member.roles.add(role);
                await interaction.reply({ content: '✅ Success! You have been verified and granted access.', ephemeral: true });
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: '❌ Error: I do not have permission to manage roles.', ephemeral: true });
            }
        }
    }
});

client.login(TOKEN);
