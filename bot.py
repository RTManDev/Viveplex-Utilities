import os
import datetime
from discord import app_commands, Interaction, ButtonStyle, Object
from discord.ext import commands
import discord

# --- CONFIGURATION ---
# Replace with your actual Discord Guild (Server) ID for instant command testing
GUILD_ID = os.getenv("GUILD_ID") 
# The ID of the role given to verified users
VERIFIED_ROLE_ID = int(os.getenv("VERIFIED_ROLE_ID", "0")) 

class VerificationView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None) # persistent button

    @discord.ui.button(label="Verify Me", style=ButtonStyle.green, custom_id="verify_btn")
    async def verify_button(self, interaction: Interaction, button: discord.ui.Button):
        user = interaction.user
        
        # 1. Check Account Age (e.g., must be older than 7 days)
        min_age_days = 7
        now = datetime.datetime.now(datetime.timezone.utc)
        account_age = now - user.created_at
        
        if account_age.days < min_age_days:
            await interaction.response.send_message(
                f"❌ Verification failed. Your account must be at least {min_age_days} days old.", 
                ephemeral=True
            )
            return

        # 2. Check Name for basic Bot patterns (e.g., random gibberish or known strings)
        # You can expand this logic as needed
        username = user.name.lower()
        suspicious_keywords = ["bot_", "testbot", "spam"]
        if any(keyword in username for keyword in suspicious_keywords):
            await interaction.response.send_message(
                "❌ Verification failed. Your username triggered our automated anti-bot filters.", 
                ephemeral=True
            )
            return

        # 3. Assign Role if checks pass
        role = interaction.guild.get_role(VERIFIED_ROLE_ID)
        if role:
            try:
                await user.add_roles(role)
                await interaction.response.send_message(
                    "✅ Success! You have been verified and granted access.", 
                    ephemeral=True
                )
            except discord.Forbidden:
                await interaction.response.send_message(
                    "❌ Error: I do not have permissions to manage roles. Please contact an admin.", 
                    ephemeral=True
                )
        else:
            await interaction.response.send_message(
                "❌ Error: Verified role not found. Please check server configuration.", 
                ephemeral=True
            )

class Bot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.members = True # Required to check member info and add roles
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self):
        # Register the persistent view so buttons work after bot restarts
        self.add_view(VerificationView())
        
        if GUILD_ID:
            guild = Object(id=int(GUILD_ID))
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
            print(f"Synced commands to guild {GUILD_ID}")
        else:
            await self.tree.sync()
            print("Synced commands globally (may take up to an hour)")

bot = Bot()

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user} (ID: {bot.user.id})")

@bot.tree.command(name="verify_channel", description="Posts the verification prompt button.")
@app_commands.checks.has_permissions(administrator=True)
async def verify_channel(interaction: Interaction):
    view = VerificationView()
    await interaction.response.send_message("Click the button below to verify your account:", view=view)

# Render requires an active web port if hosted as a Web Service, 
# or you can run it as a Background Worker.
if __name__ == "__main__":
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        raise ValueError("DISCORD_TOKEN environment variable is missing!")
    bot.run(token)
