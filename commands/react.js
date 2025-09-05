const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { loadEmojiCache } = require('../utils/emojiCache');

const EMOJIS_PER_PAGE = 20;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('react')
    .setDescription('React ke pesan dengan emoji animasi')
    .addStringOption(option =>
      option
        .setName('pesan')
        .setDescription('ID atau link pesan yang ingin direact')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      const input = interaction.options.getString('pesan');

      // Load animated emojis from cache
      let validEmojis = [];
      const cachedEmojis = await loadEmojiCache();
      
      if (cachedEmojis && Array.isArray(cachedEmojis)) {
        validEmojis = cachedEmojis.filter(e =>
          e &&
          typeof e === 'object' &&
          typeof e.id === 'string' &&
          /^\d{17,19}$/.test(e.id) &&
          typeof e.name === 'string' &&
          e.name.length > 0 &&
          e.animated === true  // Ensure only animated emojis are included
        );
      }

      // If cache is empty or invalid, fallback to real-time fetching
      if (validEmojis.length === 0) {
        console.log('⚠️ Emoji cache is empty, fetching emojis in real-time...');
        // Fetch animated emojis from all guilds the bot is in
        const animatedEmojis = [];
        interaction.client.guilds.cache.forEach(guild => {
          guild.emojis.cache.forEach(emoji => {
            if (emoji.animated) {
              animatedEmojis.push({
                id: emoji.id,
                name: emoji.name
              });
            }
          });
        });

        // Remove duplicates by ID
        const uniqueEmojis = Array.from(
          new Map(animatedEmojis.map(emoji => [emoji.id, emoji])).values()
        );
        
        validEmojis = Array.isArray(uniqueEmojis)
          ? uniqueEmojis.filter(e =>
              e &&
              typeof e === 'object' &&
              typeof e.id === 'string' &&
              /^\d{17,19}$/.test(e.id) &&
              typeof e.name === 'string' &&
              e.name.length > 0)
          : [];
      }

      if (!input?.trim()) {
        return interaction.editReply({
          content: 'Input pesan tidak valid.',
          embeds: [],
          components: []
        });
      }

      const messageLinkRegex = /\/channels\/(\d+)\/(\d+)\/(\d+)/;
      let channelId, messageId;

      if (messageLinkRegex.test(input)) {
        const match = input.match(messageLinkRegex);
        [, , channelId, messageId] = match;
      } else {
        if (!/^\d{17,19}$/.test(input.trim())) {
          return interaction.editReply({
            content: 'ID pesan tidak valid. Gunakan ID 17–19 digit atau link pesan.',
            embeds: [],
            components: []
          });
        }
        messageId = input.trim();
        channelId = interaction.channelId;
      }

      if (validEmojis.length === 0) {
        return interaction.editReply({
          content: 'Emoji animasi tidak ditemukan atau tidak valid.',
          embeds: [],
          components: []
        });
      }

      let channel;
      try {
        channel = await interaction.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) throw new Error('Not text-based');
      } catch {
        return interaction.editReply({
          content: 'Channel tidak ditemukan atau bot tidak memiliki akses.',
          embeds: [],
          components: []
        });
      }

      let message;
      try {
        message = await channel.messages.fetch(messageId);
        if (!message) throw new Error('Message not found');
      } catch {
        return interaction.editReply({
          content: `Pesan tidak ditemukan di <#${channelId}>.`,
          embeds: [],
          components: []
        });
      }

      const botMember = channel.guild?.members.cache.get(interaction.client.user.id);
      const channelPermissions = channel.permissionsFor(botMember);

      if (!channelPermissions?.has(['ViewChannel', 'AddReactions'])) {
        return interaction.editReply({
          content: `Bot tidak memiliki permission untuk mereact di <#${channelId}>.`,
          embeds: [],
          components: []
        });
      }

      if (Date.now() - message.createdTimestamp > 14 * 24 * 60 * 1000) {
        return interaction.editReply({
          content: 'Pesan terlalu lama (lebih dari 14 hari) untuk direact.',
          embeds: [],
          components: []
        });
      }

      // Use an object to hold the state so it can be modified in the collector
      const state = {
        currentPage: 0
      };

      // Function to generate embed with emojis for current page
      const generateEmojiEmbed = (page) => {
        const start = page * EMOJIS_PER_PAGE;
        const pageEmojis = validEmojis.slice(start, Math.min(start + EMOJIS_PER_PAGE, validEmojis.length));
        
        let description = '';
        if (message.url) {
          description += `**Pesan target: [Link](${message.url})**\n\n`;
        } else {
          description += '**Pilih emoji untuk mereact pada pesan target:**\n\n';
        }
        
        // Add emojis with numbers to the description (always 1-20 per page)
        pageEmojis.forEach((emoji, index) => {
          const number = index + 1; // Always show 1-20 for each page
          description += `${number}. <a:${emoji.name}:${emoji.id}> [\`:${emoji.name}:\`](https://cdn.discordapp.com/emojis/${emoji.id}.gif)\n`;
        });
        
        // Add navigation info
        const totalPages = Math.ceil(validEmojis.length / EMOJIS_PER_PAGE);
        if (totalPages > 1) {
          description += `\nHalaman ${page + 1}/${totalPages}`;
        }
        
        return new EmbedBuilder()
          .setTitle('🎭 Pilih Emoji untuk React')
          .setDescription(description)
          .setColor(0x00AE86)
          .setTimestamp();
      };

      // Function to generate numbered buttons (1-20) that stay constant
      const generateNumberButtons = (page, channelId, messageId) => {
        const rows = [];
        
        // Create 4 rows with 5 buttons each (1-20)
        for (let row = 0; row < 4; row++) {
          const buttonRow = new ActionRowBuilder();
          for (let col = 0; col < 5; col++) {
            const number = row * 5 + col + 1;
            buttonRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`react_number_${number}_${channelId}_${messageId}`)
                .setLabel(number.toString())
                .setStyle(ButtonStyle.Secondary)
            );
          }
          rows.push(buttonRow);
        }
        
        // Add navigation row
        const totalPages = Math.ceil(validEmojis.length / EMOJIS_PER_PAGE);
        if (totalPages > 1) {
          const navRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`prev_page_${page}_${channelId}_${messageId}`)
                .setLabel("◀ Prev")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0),
              new ButtonBuilder()
                .setCustomId(`next_page_${page}_${channelId}_${messageId}`)
                .setLabel("Next ▶")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages - 1)
            );
          rows.push(navRow);
        }
        
        return rows;
      };

      await interaction.editReply({
        content: null,
        embeds: [generateEmojiEmbed(state.currentPage)],
        components: generateNumberButtons(state.currentPage, channelId, messageId)
      });

      // Store validEmojis in a closure so it's accessible to the collector
      const emojiData = validEmojis;

      const collector = interaction.channel.createMessageComponentCollector({
        filter: i =>
          i.user.id === interaction.user.id &&
          (i.customId.startsWith('react_number_') || i.customId.startsWith('prev_page_') || i.customId.startsWith('next_page_')),
        time: 60000
      });

      collector.on('collect', async button => {
        try {
          if (button.customId.startsWith('react_number_')) {
            const parts = button.customId.split('_');
            const number = parseInt(parts[2]);
            
            // Validate number is between 1-20
            if (number < 1 || number > 20) {
              await button.reply({ 
                content: 'Nomor harus antara 1-20. Silakan pilih nomor yang valid.', 
                ephemeral: true 
              });
              return;
            }
            
            // Calculate actual emoji index based on current page (1-20 numbering)
            const emojiIndex = (state.currentPage * EMOJIS_PER_PAGE) + number - 1;
            
            if (emojiIndex >= 0 && emojiIndex < emojiData.length) {
              const selectedEmoji = emojiData[emojiIndex];
              const emojiName = selectedEmoji?.name ?? 'emoji';

              await message.react(selectedEmoji.id);

              const successEmbed = new EmbedBuilder()
                .setTitle('React Berhasil')
                .setDescription(`Pesan berhasil direact dengan emoji **${emojiName}**`)
                .setColor(0x00FF00)
                .setTimestamp()
                .setImage(`https://cdn.discordapp.com/emojis/${selectedEmoji.id}.gif`)
                .setFooter({ text: `Emoji ID: ${selectedEmoji.id}` });

              await button.update({
                content: null,
                embeds: [successEmbed],
                components: []
              });

              collector.stop('done');
            } else {
              await button.reply({ 
                content: 'Emoji tidak ditemukan. Silakan pilih nomor yang valid.', 
                ephemeral: true 
              });
            }

          } else if (button.customId.startsWith('prev_page_') || button.customId.startsWith('next_page_')) {
            // Calculate new page based on current state
            const direction = button.customId.startsWith('next_page_') ? 'next' : 'prev';
            const newPage = direction === 'next' ? state.currentPage + 1 : state.currentPage - 1;

            // Validate new page is within bounds
            const totalPages = Math.ceil(validEmojis.length / EMOJIS_PER_PAGE);
            if (newPage >= 0 && newPage < totalPages) {
              state.currentPage = newPage;
              
              // Update the embed with new page content but keep the same numbered buttons
              await button.update({
                content: null,
                embeds: [generateEmojiEmbed(state.currentPage)],
                components: generateNumberButtons(state.currentPage, channelId, messageId)
              });
            } else {
              // If page is out of bounds, just update the buttons to reflect correct state
              await button.update({
                content: null,
                embeds: [generateEmojiEmbed(state.currentPage)],
                components: generateNumberButtons(state.currentPage, channelId, messageId)
              });
            }
          }

        } catch (err) {
          console.error('Gagal handle tombol:', err);
          await button.reply({ content: 'Terjadi kesalahan saat memproses tombol.', emeraephl: true });
        }
      });

      collector.on('end', async (_, reason) => {
        if (reason !== 'done') {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle('Waktu Habis')
            .setDescription('Tidak ada emoji yang dipilih dalam 60 detik.')
            .setColor(0xFF9900)
            .setTimestamp();

          await interaction.editReply({
            content: null,
            embeds: [timeoutEmbed],
            components: []
          });
        }
      });

    } catch (error) {
      console.error('Error utama:', error);
      const fallback = 'Terjadi kesalahan internal. Silakan coba lagi.';

      try {
        if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({
            content: fallback,
            embeds: [],
            components: []
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: fallback,
            ephemeral: true
          });
        }
      } catch (fallbackError) {
        console.error('Error in fallback response:', fallbackError);
      }
    }
  }
};
