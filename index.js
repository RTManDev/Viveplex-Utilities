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

app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(PORT, () => {
    if (SITE_URL && !SITE_URL.includes('undefined')) {
        setInterval(async () => {
            try {
                await fetch(SITE_URL);
            } catch (e) {
                console.error('[Ping Error] Failed to ping:', e.message);
            }
        }, 300000); 
    }
});

// --- 2. CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const MEDIA_CHANNEL_ID = process.env.MEDIA_CHANNEL_ID; 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,   
        GatewayIntentBits.MessageContent   
    ]
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
    for (let j = 0; j < 10; j++) randomCode += Math.floor(Math.random() * 10);
    suspiciousKeywords.push(randomCode);
}

// --- 4. ANTI-BOT / OBSCENITY MODERATION MATRIX ---
function containsHorribleWords(username) {
    let cleanName = username.toLowerCase()
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a')
        .replace(/5/g, 's').replace(/7/g, 't').replace(/8/g, 'b').replace(/[\W_]+/g, '');
    const explicitFilter = ['nigger', 'nigga', 'faggot', 'retard', 'kike', 'chink', 'cunt', 'bitch', 'whore', 'slut'];
    return explicitFilter.some(word => cleanName.includes(word));
}

client.once('ready', async () => {
    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
        console.log('Bot running seamlessly with live URL formatting initialized.');
    } catch (error) {
        console.error(error);
    }
});

// --- 5. SOCIAL MEDIA EMBED ENGINE (KEEP LINK + VIDEO PREVIEW) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.id !== MEDIA_CHANNEL_ID) return;

    // Matches standard streaming links
    const mediaRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|tiktok\.com|twitch\.tv|instagram\.com|twitter\.com|x\.com)\/\S+)/i;
    const match = message.content.match(mediaRegex);

    if (match) {
        const targetUrl = match[0];

        // Delete raw unformatted text prompt
        try {
            await message.delete();
        } catch (err) {
            console.error('Missing Manage Messages permission.', err.message);
        }

        // Clean out the URL from text to extract the title context
        const userProvidedTitle = message.content.replace(targetUrl, '').trim() || "Shared Video";

        // This matches the text spacing from your reference layout:
        // Line 1: User's title tag (e.g. [🔴 LIVE | Just Playing Roblox])
        // Line 2: Explicit clickable raw text link path wrapped in parentheses
        const formattedDescription = `**${userProvidedTitle}**\n(${targetUrl})`;

        const mediaEmbed = new EmbedBuilder()
            .setDescription(formattedDescription)
            .setColor(0x2b2d31); // Seamless grey frame box container layout

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Watch Video')
                .setURL(targetUrl)
                .setStyle(ButtonStyle.Link)
        );

        // Sending the text embed with the action button.
        // Also appending the raw link text outside the embed field at the end of the post array. 
        // This forces Discord's internal browser scraper to append its native rich video player frame automatically right beneath the layout.
        await message.channel.send({
            content: targetUrl, 
            embeds: [mediaEmbed],
            components: [actionRow]
        });
    }
});

// --- 6. CORE COMMANDS & VERIFICATION MANAGEMENT ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'verify_channel') {
            if (interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({ 
                    content: "❌ This setup command can only be executed by the server owner.", 
                    ephemeral: true 
                });
            }

            await interaction.deferReply({ ephemeral: true });
            await interaction.deleteReply();

            const embed = new EmbedBuilder()
                .setTitle('Verification')
                .setDescription('Press Verify Now to unlock the rest of the channels.')
                .setColor(0x2b2d31);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('verify_btn').setLabel('Verify Now').setStyle(ButtonStyle.Primary)
            );
            await interaction.channel.send({ embeds: [embed], components: [row] });
        }
    }

    if (interaction.isButton() && interaction.customId === 'verify_btn') {
        const member = interaction.member;
        const user = interaction.user;

        if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
            return interaction.reply({ content: 'You are already verified.', ephemeral: true });
        }

        const minAgeDays = 7;
        const accountAgeDays = (Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (accountAgeDays < minAgeDays) {
            return interaction.reply({ content: `Verification failed. Your account must be at least ${minAgeDays} days old.`, ephemeral: true });
        }

        const username = user.username.toLowerCase();
        if (suspiciousKeywords.some(keyword => username.includes(keyword)) || containsHorribleWords(user.username)) {
            return interaction.reply({ content: 'Verification failed. Security filter restrictions triggered.', ephemeral: true });
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
