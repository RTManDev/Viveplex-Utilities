const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes,
    PermissionsBitField
} = require('discord.js');
const express = require('express');

// --- 1. WEB SERVER KEEPALIVE FOR RENDER ---
const app = express();
const PORT = process.env.PORT || 10000;
const SITE_URL = process.env.RENDER_EXTERNAL_URL;

app.get('/', (req, res) => res.status(200).send('Bot is active and healthy!'));

app.listen(PORT, '0.0.0.0', () => {
    console.log('Web listener securely attached to port ' + PORT);
});

// --- 2. CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const MEDIA_CHANNEL_ID = process.env.MEDIA_CHANNEL_ID; 

// Bug Forum Constants
const BUG_FORUM_ID = '1553615498233778186';
const RESOLVED_TAG_ID = '1553615891005050890';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,   
        GatewayIntentBits.MessageContent   
    ]
});

const commands = [
    {
        name: 'verify_channel',
        description: 'Posts the verification prompt UI.'
    },
    {
        name: 'bug-report',
        description: 'Marks the current bug report post as resolved (Mod Only).'
    }
];

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
        console.log('Bot logged in as ' + client.user.tag + '. Commands synced.');
        
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

// --- 6. AUTO-NUMBERING FOR NEW BUG FORUM POSTS ---
client.on('threadCreate', async (thread, newlyCreated) => {
    if (!newlyCreated || thread.parentId !== BUG_FORUM_ID) return;
    if (/^BUG-\d+\s*-/i.test(thread.name)) return;

    try {
        const forumChannel = thread.parent;
        let maxBugNumber = 0;

        const activeThreads = await forumChannel.threads.fetchActive();
        const archivedThreads = await forumChannel.threads.fetchArchived();

        const allThreads = [
            ...activeThreads.threads.values(), 
            ...archivedThreads.threads.values()
        ];

        for (const t of allThreads) {
            const match = t.name.match(/^BUG-(\d+)/i);
            if (match && match[1]) {
                const num = parseInt(match[1], 10);
                if (num > maxBugNumber) maxBugNumber = num;
            }
        }

        const nextBugNumber = maxBugNumber + 1;
        const newTitle = ('BUG-' + nextBugNumber + ' - ' + thread.name).slice(0, 100);

        await thread.setName(newTitle);
        console.log('Renamed new bug post to: ' + newTitle);
    } catch (err) {
        console.error('Failed to auto-number forum post:', err.message);
    }
});

// --- 7. SOCIAL MEDIA EMBED ENGINE ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.id !== MEDIA_CHANNEL_ID) return;

    const mediaRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|tiktok\.com|twitch\.tv|instagram\.com|twitter\.com|x\.com)\/\S+)/i;
    const match = message.content.match(mediaRegex);

    if (match && match[0]) {
        const targetUrl = match[0];

        try {
            await message.delete();
        } catch (err) {
            console.error('Missing Manage Messages permission.', err.message);
        }

        let videoTitle = '';

        if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
            try {
                const response = await fetch('https://noembed.com' + encodeURIComponent(targetUrl));
                const data = await response.json();
                if (data.title) {
                    videoTitle = data.title;
                }
            } catch (err) {
                console.error('Title fetch failed:', err.message);
            }
        }

        if (!videoTitle) {
            videoTitle = message.content.replace(targetUrl, '').trim() || 'Shared Video';
        }

        const invisibleEmbedCode = '[ ](' + targetUrl + ')';
        const finalMessageLayout = '## ' + videoTitle + invisibleEmbedCode;

        await message.channel.send({ content: finalMessageLayout });

        const unixTimestamp = Math.floor(Date.now() / 1000);
        const compactTimestampText = '### <t:' + unixTimestamp + ':R>';

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Watch Video')
                .setURL(targetUrl)
                .setStyle(ButtonStyle.Link)
        );

        await message.channel.send({
            content: compactTimestampText,
            components: [actionRow]
        });
    }
});

// --- 8. SLASH COMMANDS & VERIFICATION HANDLER ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        
        // COMMAND 1: /verify_channel (Owner Only)
        if (interaction.commandName === 'verify_channel') {
            if (interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({ 
                    content: '❌ This setup command can only be executed by the server owner.', 
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

        // COMMAND 2: /bug-report (Mod Only - Marks post as Resolved with Embed)
        if (interaction.commandName === 'bug-report') {
            const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.ManageThreads) || 
                          interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

            if (!isMod) {
                return interaction.reply({
                    content: '❌ You need Moderator permissions to use this command.',
                    ephemeral: true
                });
            }

            const channel = interaction.channel;
            if (!channel.isThread() || channel.parentId !== BUG_FORUM_ID) {
                return interaction.reply({
                    content: '❌ This command can only be used inside a post in the Bug Reports forum.',
                    ephemeral: true
                });
            }

            try {
                const currentTags = channel.appliedTags || [];
                if (currentTags.includes(RESOLVED_TAG_ID)) {
                    return interaction.reply({
                        content: 'ℹ️ This bug report is already marked as resolved.',
                        ephemeral: true
                    });
                }

                const updatedTags = [...currentTags, RESOLVED_TAG_ID].slice(0, 5);
                await channel.setAppliedTags(updatedTags);

                const bugMatch = channel.name.match(/^(BUG-\d+)/i);
                const bugLabel = bugMatch && bugMatch[1] ? bugMatch[1].toUpperCase() : 'Bug Report';

                const updatedEmbed = new EmbedBuilder()
                    .setTitle('Bug Report Updated')
                    .setDescription('Marked **' + bugLabel + '** as **Resolved** in <#' + channel.id + '>.')
                    .setColor(0x57F287);

                await interaction.reply({ embeds: [updatedEmbed] });
            } catch (err) {
                console.error('Error applying forum tag:', err);
                await interaction.reply({
                    content: '❌ Failed to apply the tag. Make sure my Bot role has **Manage Threads** permissions.',
                    ephemeral: true
                });
            }
        }
    }

    // BUTTON: Verify Now
    if (interaction.isButton() && interaction.customId === 'verify_btn') {
        const member = interaction.member;
        const user = interaction.user;

        if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
            return interaction.reply({ content: 'You are already verified.', ephemeral: true });
}
const minAgeDays = 7;
const accountAgeDays = (Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24);
if (accountAgeDays < minAgeDays) {
return interaction.reply({
content: 'Verification failed. Your account must be at least ' + minAgeDays + ' days old.',
ephemeral: true
});
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
