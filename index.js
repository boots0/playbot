// index.js
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ChannelType 
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

// --- CHANGED LINE ---
// We've added GatewayIntentBits.MessageContent to the intents array
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent // ADD THIS INTENT
  ] 
});
// --- END CHANGED SECTION ---

client.commands = new Map();

// 1) Load all command modules from ./commands
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // 2) Slash command handling
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction, client);
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Error executing command.', ephemeral: true });
    }
    return;
  }

  // 3) Modal submission handling (from your original code, kept for completeness)
  if (interaction.isModalSubmit() && interaction.customId === 'submitIdeaModal') {
    const ticker = interaction.fields.getTextInputValue('tickerInput');
    const thesis = interaction.fields.getTextInputValue('thesisInput');
    const play   = interaction.fields.getTextInputValue('playInput');

    const embed = new EmbedBuilder()
      .setDescription(thesis)
      .setFooter({ text: `Submitted by ${interaction.user.tag}` })
      .setTimestamp();

    const channel = await client.channels.fetch(process.env.TARGET_CHANNEL_ID);

    if (channel.type === ChannelType.GuildForum) {
      await channel.threads.create({
        name: `💡 ${ticker} — ${play}`,
        autoArchiveDuration: 1440,
        message: { embeds: [embed] }
      });
    } else {
      embed.setTitle(`💡 ${ticker} — ${play}`);
      await channel.send({ embeds: [embed] });
    }

    await interaction.reply({ content: '✅ Idea submitted!', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);