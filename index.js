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

// --- 1. WEB SERVER KEEPALIVE FOR RENDER ---
const app = express();
const PORT = process.env.PORT || 10000;
const SITE_URL = process.env.RENDER_EXTERNAL_URL;

app.get('/', (req, res) => res.status(200).send('Bot is active and healthy!'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web listener securely attached to port ${PORT}`);
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

// --- 5. INITIALIZATION & LIVE KEEP-ALIVE ---
client.once('ready', async () => {
    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
        console.log(`Bot logged in as ${client.user.tag}. Application metadata sync complete.`);
        
        if (SITE_URL && !SITE_URL.includes('undefined')) {
            setInterval(async () => {
                try {
                    await fetch(SITE_URL);
                } catch (e) {
                    console.error('[KeepAlive Error] Traffic skip:', e.message);
                }
            }, 300000); 
        }
    } catch (error) {
        console.error('Initialization Error:', error);
    }
});

// --- 6. SOCIAL MEDIA EMBED ENGINE (HEADER LINK HYPERLINK + SMALL TIMESTAMP) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.id !== MEDIA_CHANNEL_ID) return;

    const mediaRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|tiktok\.com|twitch\.tv|instagram\.com|twitter\.com|x\.com)\/\S+)/i;
    const match = message.content.match(mediaRegex);

    if (match) {
        const targetUrl = match[1]; // Extract valid exact string URL sequence matching capture brackets

        try {
            await message.delete();
        } catch (err) {
            console.error('Missing Manage Messages permission in channel settings.', err.message);
        }

        // Extract description text context by wiping out URL segments from strings
        const customTitle = message.content.replace(targetUrl, '').trim() || "Shared Video Link";

        // Formats line as a massive Markdown heading (##) with masked hyperlink structure
        // Looks exactly like: ## [Your Custom Text Title Here](https://youtube.com...)
        const markdownHeaderContent = `## [${customTitle}](${targetUrl})`;

        // 1. Post text header element with the raw text link payload appended silently.
        // The hidden terminal targetUrl string forces Discord's native media scraper engine to append the large video block player.
        await message.channel.send({ content: `${markdownHeaderContent}\n${targetUrl}` });

        // Calculate Unix timeline context integer
        const unixTimestamp = Math.floor(Date.now() / 1000);
        // Formats relative text size down using ### header markers
        const compactTimestampText = `### <t:${unixTimestamp}:R>`;

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Watch Video')
                .setURL(targetUrl)
                .setStyle(ButtonStyle.Link)
        );

        // 2. Post timestamp tracking segment directly stacked over the interaction row button layout frame
        await message.channel.send({
            content: compactTimestampText,
            components: [actionRow]
        });
    }
});

// --- 7. CORE COMMANDS & VERIFICATION MANAGEMENT ---
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
