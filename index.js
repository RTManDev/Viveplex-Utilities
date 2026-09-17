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
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(PORT);

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

// --- 3. UI HANDLER ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'verify_channel') {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: "You don't have permission to access this command.", ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('Verification')
                .setDescription('Press Verify Now to unlock the rest of the channels.')
                .setColor(0x2b2d31); // Blends natively into dark background

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_btn')
                    .setLabel('Verify Now')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    // --- 4. VERIFICATION PROCESSING LOGIC ---
    if (interaction.isButton() && interaction.customId === 'verify_btn') {
        const member = interaction.member;
        const user = interaction.user;

        // **ADDED CHECK**: If they already have the verification role, stop here
        if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
            return interaction.reply({
                content: 'You are already verified.',
                ephemeral: true
            });
        }

        // Account Age Metric Check (7 Days minimum limit)
        const minAgeDays = 7;
        const accountAgeDays = (Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24);

        if (accountAgeDays < minAgeDays) {
            return interaction.reply({
                content: `Verification failed. Your account must be at least {minAgeDays} days old.`,
                ephemeral: true
            });
        }

        // Username Pattern Check
        const username = user.username.toLowerCase();
        const suspiciousKeywords = ['bot_', 'testbot', '68540', '47093', '98506', '26703', '52016', '75896', '04977', '75219', '95234', '09174', '50801', '03090', '25445', '41064', '57791', '25363', '00355', '65777', '41657', '94362'];
        if (suspiciousKeywords.some(keyword => username.includes(keyword))) {
            return interaction.reply({
                content: 'Verification failed. Automated filter triggered.',
                ephemeral: true
            });
        }

        // Assign Role
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
