/* shared/config.js — ตั้งค่าระดับ deploy: เลือก skin ของทั้งเว็บ
   deployer แก้ค่า skin บรรทัดเดียว แล้ว push — ไม่ต้องแตะไฟล์อื่น
   ต้องโหลดแบบ sync ใน <head> ก่อน styles.css และ layout.js ของทุกหน้า */
window.PhysicsSimConfig = {
  skin: 'dot-matrix', // ← เปลี่ยนเป็น 'comic' เพื่อสลับทั้งเว็บ

  /* ทะเบียน skin: แต่ละ skin ประกาศว่ารองรับโหมดไหน
     ถ้ารองรับโหมดเดียว layout.js จะบังคับโหมดนั้นและซ่อนปุ่ม toggle */
  skins: {
    'dot-matrix': { modes: ['light', 'dark'] },
    'comic': { modes: ['light'] }
  }
};
