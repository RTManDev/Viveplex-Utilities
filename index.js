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

// --- 1. WEB SERVER KEEPALIVE & SELF-PINGER FOR RENDER ---
const app = express();
const PORT = process.env.PORT || 8080;
const SITE_URL = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`;

app.get('/', (req, res) => {
    res.send('Bot is active!');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
    
    // Automatically start pinging every 5 minutes (300,000 milliseconds)
    if (SITE_URL && !SITE_URL.includes('undefined')) {
        console.log(`Self-ping initialization started for: ${SITE_URL}`);
        setInterval(async () => {
            try {
                // Dynamically use native fetch available in Node.js v18+
                const response = await fetch(SITE_URL);
                console.log(`[Ping] Keep-alive successful. Status: ${response.status} at ${new Date().toISOString()}`);
            } catch (error) {
                console.error('[Ping Error] Failed to ping server:', error.message);
            }
        }, 300000); 
    } else {
        console.log('⚠️ [Warning] RENDER_EXTERNAL_URL environment variable is missing. Self-ping skipped.');
    }
});

// --- 2. CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const commands = [{
    name: 'verify_channel',
    description: 'Posts the verification prompt UI.'
}];

const rest = new REST({ version: '10' }).setToken(TOKEN);

// --- 3. AUTO-GENERATING RANDOM 10-DIGIT NUMBERS ---
const suspiciousKeywords = [
    'bot_', 'testbot', '68540', '47093', '98506', '26703', '52016', 
    '75896', '04977', '75219', '95234', '09174', '50801', '03090', 
    '25445', '41064', '57791', '25363', '00355', '65777', '41657', '94362'
];

for (let i = 0; i < 50; i++) {
    let randomCode = '';
    for (let j = 0; j < 10; j++) {
        randomCode += Math.floor(Math.random() * 10);
    }
    suspiciousKeywords.push(randomCode);
}

// --- 4. HELPER FUNCTION: TEXT NORMALIZATION FILTER ---
function containsHorribleWords(username) {
    let cleanName = username.toLowerCase()
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a')
        .replace(/5/g, 's')
        .replace(/7/g, 't')
        .replace(/8/g, 'b')
        .replace(/[\W_]+/g, '');

    const explicitFilter = [
        'nigger', 'nigga', 'faggot', 'retard', 'kike', 'chink', 'cunt', 'bitch', 'whore', 'slut'
    ];

    return explicitFilter.some(word => cleanName.includes(word));
}

// --- 5. UI HANDLER ---
client.once('ready', async () => {
    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands }
        );
        console.log('Commands successfully synced.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'verify_channel') {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: "You don't have permission to access this command.", ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });
            await interaction.deleteReply();

            const embed = new EmbedBuilder()
                .setTitle('Verification')
                .setDescription('Press Verify Now to unlock the rest of the channels.')
                .setColor(0x2b2d31);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_btn')
                    .setLabel('Verify Now')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
        }
    }

    // --- 6. VERIFICATION PROCESSING LOGIC ---
    if (interaction.isButton() && interaction.customId === 'verify_btn') {
        const member = interaction.member;
        const user = interaction.user;

        if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
            return interaction.reply({
                content: 'You are already verified.',
                ephemeral: true
            });
        }

        const minAgeDays = 7;
        const accountAgeDays = (Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24);

        if (accountAgeDays < minAgeDays) {
            return interaction.reply({
                content: `Verification failed. Your account must be at least ${minAgeDays} days old.`,
                ephemeral: true
            });
        }

        const username = user.username.toLowerCase();
        if (suspiciousKeywords.some(keyword => username.includes(keyword))) {
            return interaction.reply({
                content: 'Verification failed. Automated filter triggered.',
                ephemeral: true
            });
        }

        if (containsHorribleWords(user.username)) {
            return interaction.reply({
                content: 'Verification failed. Your username contains banned or offensive terms.',
                ephemeral: true
            });
        }

        const role = interaction.guild.roles.cache.get(VERIFIED_ROLE_ID);
        if (!role) return interaction.reply({ content: 'Role configuration missing.', ephemeral: true });

        try {
            await member.roles.add(role);
            await interaction.reply({ content: 'You have been verified.', ephemeral: true });
        } catch (err) {
            await interaction.reply({ content: 'Drag Bot role higher in settings.', ephemeral: true });
        }
    }
});

client.login(TOKEN);
