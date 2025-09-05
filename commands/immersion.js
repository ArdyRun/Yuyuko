const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../firebase/firestore");
const getCoverImageByType = require("../utils/getCoverImage");
const { updateUserStreak } = require("../utils/streak"); 
const { getUserStreakByMedia, getUserStreak } = require("../utils/streak"); 
const { getMediaInfo, searchAniList, getAniListInfoById } = require("../utils/anilistAPI");
const { getVNInfo, getVNInfoById, searchVNs } = require("../utils/vndbAPI");
const { extractYouTubeVideoId, getYouTubeVideoInfo, normalizeYouTubeUrl } = require("../utils/youtube");

module.exports = {
  name: "immersion",
  data: new SlashCommandBuilder()
    .setName("immersion")
    .setDescription("Catat aktivitas immersion bahasa Jepang kamu")
    .addStringOption(option =>
      option
        .setName("media_type")
        .setDescription("Pilih jenis immersion yang ingin dicatat.")
        .setRequired(true)
        .addChoices(
          { name: "Visual Novel (in characters read)", value: "visual_novel" },
          { name: "Manga (in pages read)", value: "manga" },
          { name: "Anime (in episodes watched)", value: "anime" },
          { name: "Book (in pages read)", value: "book" },
          { name: "Reading Time (in minutes)", value: "reading_time" },
          { name: "Listening (in minutes)", value: "listening" },
          { name: "Reading (in characters read)", value: "reading" },
        )
    )
    .addNumberOption(option =>
      option
        .setName("amount")
        .setDescription("Jumlah aktivitas (misalnya: episode, halaman, menit, karakter, dll)")
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName("title")
        .setDescription("Judul media yang kamu konsumsi")
        .setRequired(false)
        .setAutocomplete(true))
    .addStringOption(option =>
      option
        .setName("comment")
        .setDescription("Komentar atau catatan tambahan")
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName("date")
        .setDescription("Tanggal dalam format YYYY-MM-DD (opsional, default: hari ini)")
        .setRequired(false)),

  async execute(interaction) {
    // Handle autocomplete
    if (interaction.isAutocomplete()) {
      return await this.autocomplete(interaction);
    }

    await interaction.deferReply();

    const media_type = interaction.options.getString("media_type");
    let amount = interaction.options.getNumber("amount");
    let title = interaction.options.getString("title") || "-";
    const comment = interaction.options.getString("comment") || "-";
    const customDate = interaction.options.getString("date");
    const user = interaction.user;
    let thumbnail = null;
    let rawTitle = title;
    let mediaUrl = null;
    let anilistInfo = null;
    let vndbInfo = null;
    let url = null;

    // Validate custom date if provided
    let inputDate, localDate, dateStr, now;
    if (customDate) {
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(customDate)) {
        return await interaction.editReply({
          content: "Invalid date format. Please use YYYY-MM-DD (e.g., 2024-01-15)."
        });
      }

      inputDate = new Date(customDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Validate date is not in the future
      if (inputDate > today) {
        return await interaction.editReply({
          content: "Cannot log immersion for future dates."
        });
      }

      // Validate date is not too old (more than 1 year)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      if (inputDate < oneYearAgo) {
        return await interaction.editReply({
          content: "Cannot log immersion for dates older than 1 year."
        });
      }

      // Use custom date
      localDate = new Date(customDate);
      dateStr = customDate;
      now = new Date(); // For database timestamps
    } else {
      // Use today's date
      now = new Date();
      localDate = new Date(
        now.getFullYear(), now.getMonth(), now.getDate()
      );
      
      dateStr = [
        localDate.getFullYear(),
        String(localDate.getMonth() + 1).padStart(2, '0'),
        String(localDate.getDate()).padStart(2, '0')
      ].join('-');
    }

    // Listening URL logic with YouTube API
    if (media_type === "listening") {
      const urlEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📺 Listening Activity")
        .setDescription("Silakan reply dengan **URL YouTube** untuk media listening Anda, atau ketik **skip** untuk melewati:")
        .addFields(
          { name: "Format yang diterima:", value: "• `https://youtube.com/watch?v=...`\n • `https://youtu.be/...`\n• `video_id`\n• atau ketik `skip`", inline: false }
        )
        .setFooter({ text: "Timeout dalam 60 detik" });

      await interaction.editReply({ embeds: [urlEmbed] });

      const filter = (message) => message.author.id === user.id;
      
      try {
        const collected = await interaction.channel.awaitMessages({
          filter,
          max: 1,
          time: 60000,
          errors: ['time']
        });

        const response = collected.first();
        const userInput = response.content.trim().toLowerCase();
        
        if (userInput !== 'skip') {
          url = response.content.trim();
          
          const videoId = extractYouTubeVideoId(url);
            
            // Get video info from YouTube API
            const videoInfo = await getYouTubeVideoInfo(videoId);
            
            if (videoInfo) {
              if (videoInfo.title) {
                rawTitle = videoInfo.title;
              }

              if (videoInfo.duration) {
                amount = Math.ceil(videoInfo.duration / 60); // Convert seconds to minutes
              }

              if (videoInfo.thumbnail) {
                thumbnail = videoInfo.thumbnail;
              }
              
              // Normalize the URL for storage
              url = `https://youtube.com/watch?v=${videoId}`;
            }
            
            try {
              await response.delete();
            } catch (err) {
              // Ignore delete errors
            }
        } else {
          try {
            await response.delete();
          } catch (err) {
            // Ignore delete errors
          }
        }
        
      } catch (err) {
        await interaction.followUp({
          content: "⏰ Timeout! Melanjutkan tanpa URL YouTube...",
          ephemeral: true
        });
      }
    }

    // VNDB info logic (unchanged)
    if (title && title !== "-" && media_type === "visual_novel") {
        if (title.includes('|')) {
          const [vnTitle, vnId] = title.split('|');
          rawTitle = vnTitle;
          vndbInfo = await getVNInfoById(vnId);
        } else {
          vndbInfo = await getVNInfo(title);
        }
        
        if (vndbInfo) {
          rawTitle = vndbInfo.title;
          mediaUrl = vndbInfo.url;
          if (vndbInfo.image && !thumbnail) {
            thumbnail = vndbInfo.image;
          }
        }
    }

    // AniList info logic (unchanged)
    if (title && title !== "-" && ['anime', 'manga'].includes(media_type)) {
        if (title.includes('|')) {
          const [aniTitle, aniId] = title.split('|');
          rawTitle = aniTitle;
          const anilistType = media_type === 'anime' ? 'ANIME' : 'MANGA';
          anilistInfo = await getAniListInfoById(aniId, anilistType);
        } else {
          anilistInfo = await getMediaInfo(title, media_type);
        }
        
        if (anilistInfo) {
          rawTitle = anilistInfo.title;
          mediaUrl = anilistInfo.url;
          if (anilistInfo.image && !thumbnail) {
            thumbnail = anilistInfo.image;
          }
        }
    }

    const unitMap = {
      visual_novel: "characters",
      manga: "pages", 
      anime: "episodes",
      book: "pages",
      reading_time: "minutes",
      listening: "minutes",
      reading: "characters",
    };

    const labelMap = {
      visual_novel: "Visual Novel",
      manga: "Manga",
      anime: "Anime", 
      book: "Book",
      reading_time: "Reading Time",
      listening: "Listening",
      reading: "Reading",
    };

    const unit = unitMap[media_type];
    const label = labelMap[media_type];
    
    try {
      // Get image URL
      let imageUrl = null;
      if (media_type === "listening" && thumbnail) {
        imageUrl = thumbnail;
      } else if (media_type === "visual_novel" && vndbInfo?.image) {
        imageUrl = vndbInfo.image;
      } else if (thumbnail) {
        imageUrl = thumbnail;
      } else {
        imageUrl = await getCoverImageByType(media_type, rawTitle);
      }  

      // Create immersion log entry
      const logData = {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName || user.username,
          avatar: user.displayAvatarURL({ size: 64 })
        },
        activity: {
          type: media_type,
          typeLabel: label,
          amount: amount,
          unit: unit,
          title: rawTitle,
          comment: comment !== "-" ? comment : null,
          url: media_type === "listening" && url ? normalizeYouTubeUrl(url) : null,
          anilistUrl: anilistInfo ? mediaUrl : null,
          vndbUrl: vndbInfo ? mediaUrl : null
        },
        metadata: {
          thumbnail: thumbnail || null,
          duration: media_type === "listening" ? amount : null,
          source: media_type === "listening" ? "youtube" : 
                  vndbInfo ? "vndb" : 
                  anilistInfo ? "anilist" : "manual",
          vndbInfo: vndbInfo ? {
            developer: vndbInfo.developer,
            released: vndbInfo.released,
            length: vndbInfo.length,
            description: vndbInfo.description
          } : null
        },
        timestamps: {
          created: customDate ? new Date() : now,
          date: dateStr,
          month: dateStr.slice(0, 7),
          year: localDate.getFullYear()
        }
      };

      // Add log to user's collection
      await db.collection("users").doc(user.id).collection("immersion_logs").add(logData);

      // ===== FIX: Proper stats update with validation =====
      const userStatsRef = db.collection("users").doc(user.id);
      
      // Use transaction to ensure consistency
      await db.runTransaction(async (transaction) => {
        const userStatsDoc = await transaction.get(userStatsRef);
        
        let currentData = {};
        if (userStatsDoc.exists) {
          currentData = userStatsDoc.data() || {};
        }
        
        // Initialize stats object if it doesn't exist
        if (!currentData.stats) {
          currentData.stats = {};
        }
        
        // Initialize specific media type stats if it doesn't exist
        if (!currentData.stats[media_type]) {
          currentData.stats[media_type] = {
            total: 0,
            sessions: 0,
            lastActivity: null,
            bestStreak: 0,
            currentStreak: 0,
            unit: unit,
            label: label
          };
        }
        
        // Safely get current values with fallbacks
        const currentTotal = currentData.stats[media_type].total || 0;
        const currentSessions = currentData.stats[media_type].sessions || 0;
        
        // Calculate new values
        const newTotal = currentTotal + amount;
        const newSessions = currentSessions + 1;
        
        // Update the stats for this media type
        currentData.stats[media_type] = {
          ...currentData.stats[media_type],
          total: newTotal,
          sessions: newSessions,
          lastActivity: customDate ? new Date() : now,
          unit: unit,
          label: label
        };
        
        // Update profile info
        if (!currentData.profile) {
          currentData.profile = {};
        }
        
        currentData.profile = {
          ...currentData.profile,
          id: user.id,
          username: user.username,
          displayName: user.displayName || user.username,
          avatar: user.displayAvatarURL({ size: 64 }),
          lastSeen: customDate ? new Date() : now
        };
        
        // Update summary
        if (!currentData.summary) {
          currentData.summary = {};
        }
        
        const totalSessions = Object.values(currentData.stats).reduce((sum, stat) => {
          return sum + (stat.sessions || 0);
        }, 0);
        
        currentData.summary = {
          ...currentData.summary,
          totalSessions: totalSessions,
          lastActivity: customDate ? new Date() : now,
          joinDate: currentData.summary?.joinDate || (customDate ? new Date() : now),
          activeTypes: Object.keys(currentData.stats)
        };
        
        // Update timestamps
        currentData.timestamps = {
          updated: customDate ? new Date() : now,
          lastLog: customDate ? new Date() : now
        };
        
        // Write the updated data
        transaction.set(userStatsRef, currentData, { merge: true });
        
        // Store newTotal for display
        currentData._newTotal = newTotal;
      });

      // Update streaks after successful database update
      await updateUserStreak(user.id);
      const { streak: globalStreak } = await getUserStreak(user.id);
      const { streak: mediaStreak, longest: mediaLongest } = await getUserStreakByMedia(user.id, media_type);

      // Update streak info in database
      await userStatsRef.update({
        [`stats.${media_type}.currentStreak`]: mediaStreak || 0,
        [`stats.${media_type}.bestStreak`]: mediaLongest || 0
      });

      // Get the updated total for display
      const finalDoc = await userStatsRef.get();
      const finalData = finalDoc.data();
      const updatedTotal = finalData?.stats?.[media_type]?.total || amount;

      // Create embed
      let titleText = `${label} Logged`;
      let description = null;
      
      if (media_type === "listening" && url && rawTitle) {
        description = `[${rawTitle}](${normalizeYouTubeUrl(url)})`;
      } else if (media_type === "visual_novel" && vndbInfo && mediaUrl) {
        description = `[${rawTitle}](${mediaUrl})`;
        if (vndbInfo.developer) {
          description += `\n*by ${vndbInfo.developer}*`;
        }
      } else if (anilistInfo && mediaUrl) {
        description = `[${rawTitle}](${mediaUrl})`;
      } else if (rawTitle && rawTitle !== "-") {
        description = `**${rawTitle}**`;
      }
      
      const fields = [];
      
      fields.push(
        { name: `Progress`, value: `+${amount} ${unit}`, inline: true },
        { name: `Total`, value: `${updatedTotal.toLocaleString()} ${unit}`, inline: true },
        { name: `Streak`, value: `${globalStreak || 0} day${(globalStreak || 0) === 1 ? '' : 's'}`, inline: true }
      );

      // Add VN-specific info if available
      if (media_type === "visual_novel" && vndbInfo) {
        if (vndbInfo.length) {
          const lengthLabels = {
            1: "Very short (< 2 hours)",
            2: "Short (2-10 hours)",
            3: "Medium (10-30 hours)",
            4: "Long (30-50 hours)",
            5: "Very long (> 50 hours)"
          };
          fields.push({ 
            name: "Length", 
            value: lengthLabels[vndbInfo.length] || "Unknown", 
            inline: true 
          });
        }
        
        if (vndbInfo.released) {
          fields.push({ 
            name: "Released", 
            value: vndbInfo.released, 
            inline: true 
          });
        }
      }

      if (comment && comment !== "-") {
        fields.push({ name: "Comment", value: comment, inline: false });
      }

      const embed = new EmbedBuilder()
        .setColor(0x00d4aa)
        .setTitle(titleText)
        .setDescription(description)
        .addFields(...fields)
        .setTimestamp()
        .setFooter({ 
          text: `${user.username} • ${label}`, 
          iconURL: user.displayAvatarURL({ size: 32 }) 
        });

      if (imageUrl) {
        embed.setThumbnail(imageUrl);
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error in immersion command:", err);
      await interaction.editReply({ content: "Gagal mencatat immersion. Error: " + err.message });
    }
  },

  // Autocomplete handler (unchanged)
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const mediaType = interaction.options.getString("media_type");
    
    if (focusedOption.name === 'title') {
      const searchTerm = focusedOption.value;
      
      if (!searchTerm || searchTerm.length < 2) {
        return await interaction.respond([]);
      }

      try {
        let results = [];

        if (mediaType === 'visual_novel') {
          results = await searchVNs(searchTerm, 25);
        } else if (mediaType === 'anime') {
          results = await searchAniList(searchTerm, 'ANIME', 25);
        } else if (mediaType === 'manga') {
          results = await searchAniList(searchTerm, 'MANGA', 25);
        }

        const validResults = results
          .map(item => {
            let truncatedName = item.name;
            if (truncatedName.length > 97) {
              truncatedName = truncatedName.substring(0, 97) + "...";
            }
            
            let truncatedValue = item.value;
            if (truncatedValue.length > 100) {
              if (truncatedValue.includes('|')) {
                const [title, id] = truncatedValue.split('|');
                const maxTitleLength = 100 - 1 - id.length;
                if (maxTitleLength > 10) {
                  truncatedValue = title.substring(0, maxTitleLength) + '|' + id;
                } else {
                  truncatedValue = truncatedValue.substring(0, 100);
                }
              } else {
                truncatedValue = truncatedValue.substring(0, 100);
              }
            }
            
            return {
              name: truncatedName,
              value: truncatedValue
            };
          })
          .filter(item => {
            return item.name.length <= 100 && item.value.length <= 100;
          })
          .slice(0, 25);

        await interaction.respond(validResults);
      } catch (error) {
        console.error('Autocomplete error:', error);
        await interaction.respond([]);
      }
    } else {
      await interaction.respond([]);
    }
  }
};
