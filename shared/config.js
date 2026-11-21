/* shared/config.js — ตั้งค่าระดับ deploy: เลือก skin ของทั้งเว็บ
   deployer แก้ค่า skin บรรทัดเดียว แล้ว push — ไม่ต้องแตะไฟล์อื่น
   ต้องโหลดแบบ sync ใน <head> ก่อน styles.css และ layout.js ของทุกหน้า */
window.PhysicsSimConfig = {
  skin: 'comic', // ← เปลี่ยนเป็น 'comic' เพื่อสลับทั้งเว็บ

  /* live sync (ห้องเรียน): URL ของ relay (Cloudflare Worker) — ว่าง = ปิดฟีเจอร์ทั้งเว็บ
     syncUrlDev ใช้เมื่อเปิดจาก localhost/127.0.0.1 (wrangler dev) */
  syncUrl: 'https://sky-physic-relay.banksibug.workers.dev',
  syncUrlDev: 'http://localhost:8787',

  /* ทะเบียน skin: แต่ละ skin ประกาศว่ารองรับโหมดไหน
     ถ้ารองรับโหมดเดียว layout.js จะบังคับโหมดนั้นและซ่อนปุ่ม toggle
     fontsUrl (ถ้ามี): layout.js จะแทรก <link rel="stylesheet"> ให้เฉพาะ skin ที่ active
     เพื่อไม่ให้หน้าที่ใช้ skin อื่นโหลดฟอนต์ภายนอกที่ไม่ได้ใช้ */
  skins: {
    'dot-matrix': { modes: ['light', 'dark'] },
    'comic': {
      modes: ['light'],
      fontsUrl: 'https://fonts.googleapis.com/css2?family=Kanit:wght@500;600;700;800;900&family=Bungee&display=swap'
    }
  }
};
